"""Convenience wrapper for MySQLdb."""

import collections
import google.appengine.api.app_identity as app_identity
import logging
import MySQLdb
import time

import util


class Api():
    connection = None
    cursor = None
    num_tries = 4
    retry_interval_ms = 500  # base for exponential backoff: 500, 1000, 2000...

    # Configurable on instantiation.
    cloud_sql_instance = None  # Cloud SQL instance name in project.
    cloud_sql_user = 'root'
    local_user = None
    local_password = None
    local_ip = '127.0.0.1'
    local_port = 3306
    db_name = None

    def __init__(self, **kwargs):
        keys = ['cloud_sql_instance', 'cloud_sql_user', 'local_user',
                'local_password', 'local_ip', 'local_port', 'db_name']
        for k in keys:
            v = kwargs.get(k, None)
            if v:
                setattr(self, k, v)

        self.connect_to_db()

    # This is safe as long as the class does not hold any circular references.
    # http://eli.thegreenplace.net/2009/06/12/safely-using-destructors-in-python
    def __del__(self):
        self.connection.close()

    def _cursor_retry_wrapper(self, method_name, *args):
        """Wrap the normal cursor.execute from MySQLdb with a retry."""
        tries = 0
        while True:
            try:
                # Either execute or execute_many
                getattr(self.cursor, method_name)(*args)
                break  # call succeeded, don't try again
            except MySQLdb.ProgrammingError as e:
                logging.error(e)  # log the error, but try again
                self.connect_to_db()  # try to re-establish connection
            tries += 1
            if tries >= self.num_tries:
                # That's enough tries, just throw an error.
                raise Exception("Recurrent MySQLdb.ProgrammingError, gave up.")
            # Sleep interval between tries backs off exponentially.
            # N.B. retry interval is in ms while time.sleep() takes seconds.
            time.sleep(2 ** (tries - 1) * self.retry_interval_ms / 1000)

    def _cursor_execute(self, *args):
        self._cursor_retry_wrapper('execute', *args)

    def _cursor_executemany(self, *args):
        self._cursor_retry_wrapper('executemany', *args)

    def connect_to_db(self):
        """Establish connection to MySQL db instance.

        Either Google Cloud SQL or local MySQL server. Detects environment with
        functions from util module.
        """
        if util.is_localhost() or util.is_codeship():
            credentials = {
                'host': self.local_ip,
                'port': self.local_port,
                'db': self.db_name,
                'user': self.local_user,
                'passwd': self.local_password
            }
        else:
            # Note: for second generation cloud sql instances, the instance
            # name must include the region, e.g. 'us-central1:production-01'.
            credentials = {
                'unix_socket': '/cloudsql/{app_id}:{instance_name}'.format(
                    app_id=app_identity.get_application_id(),
                    instance_name=self.cloud_sql_instance),
                'db': self.db_name,
                'user': self.cloud_sql_user,
            }

        # Although the docs say you can specify a `cursorclass` keyword
        # here as an easy way to get dictionaries out instead of lists, that
        # only works in version 1.2.5, and App Engine only has 1.2.4b4
        # installed as of 2015-03-30. Don't use it unless you know the
        # production library has been updated.
        # tl;dr: the following not allowed!
        # self.connection = MySQLdb.connect(
        #     charset='utf8', cursorclass=MySQLdb.cursors.DictCursor, **creds)
        self.connection = MySQLdb.connect(charset='utf8', **credentials)
        self.cursor = self.connection.cursor()

    def table_columns(self, table):
        result = self.query("SHOW columns FROM `{}`".format(table))
        return [column[0] for column in result]

    def reset(self, table_definitions):
        """Drop all given tables and re-created them.

        Takes a dictionary of table name to with CREATE TABLE query string.
        """
        if not util.is_development():
            raise Exception("You REALLY don't want to do that.")

        for table, definition in table_definitions.items():
            self.query('DROP TABLE IF EXISTS `{}`;'.format(table))
            self.query(definition)

    def query(self, query_string, param_tuple=tuple(), n=None):
        """Run a general-purpose query. Returns a tuple of tuples."""
        self._cursor_execute(query_string, param_tuple)
        if n is None:
            return self.cursor.fetchall()
        else:
            return self.cursor.fetchmany(n)

    def select_query(self, query_string, param_tuple=tuple(), n=None):
        """Simple extension of .query() by making results more convenient.

        Interpolate with %s syntax and the param_tuple argument. Example:
        sql_api.query(
            "SELECT * FROM heroes WHERE name = %s AND age = %s",
            ('Hector', 20)
        )
        """
        result = self.query(query_string, param_tuple, n)

        # Results come back as a tuple of tuples. Discover the names of the
        # SELECTed columns and turn it into a list of dictionaries.
        fields = [f[0] for f in self.cursor.description]
        return [{fields[i]: v for i, v in enumerate(row)} for row in result]

    def select_star_where(self, table, order_by=None, limit=100,
                          **where_params):
        """Get whole rows matching filters. Restricted but convenient."""
        if where_params:
            items = where_params.items()
            keys = [k for k, v in items]
            values = tuple([v for k, v in items])
            where_clauses = ['`{}` = %s'.format(k) for k in keys]
        else:
            values = tuple()
            where_clauses = ['1']

        return self.select_query(
            "SELECT * FROM `{}` WHERE {} {order_by} LIMIT {limit} ".format(
                table,
                ' AND '.join(where_clauses),
                order_by='ORDER BY `{}`'.format(order_by) if order_by else '',
                limit=limit,
            ),
            values
        )

    def select_single_value(self, query_string, param_tuple=tuple()):
        """Returns the first value of the first row of results, or None."""
        self._cursor_execute(query_string, param_tuple)
        result = self.cursor.fetchone()

        # result is None if no rows returned, else a tuple.
        return result if result is None else result[0]

    def _commit(self):
        """Must be called for INSERT and UPDATE queries or they won't work.

        Raises MySQLdb.Error on failed commit, with automatic rollback.
        """
        try:
            self.connection.commit()
        except MySQLdb.Error as e:
            logging.error("Last query run was:\n{}"
                          .format(self.cursor._last_executed))
            self.connection.rollback()
            raise MySQLdb.Error(
                "MySQLdb error on INSERT. Will be rolled back. {}".format(e))

    def insert_row_dicts(self, table, row_dicts):
        """Insert one record or many records.

        Accepts a dictionary of values to insert, or a list of such.

        Returns True on success and an error message string on error.
        """
        # Accepts a single dictionary or a list of them. Standardize to list.
        if type(row_dicts) is not list:
            row_dicts = [row_dicts]

        # Turn each row dictionary into an ordered dictionary
        ordered_rows = [collections.OrderedDict(
            sorted(d.items(), key=lambda t: t[0])) for d in row_dicts]

        # Make sure each dictionary has the same set of keys.
        correct_keys = ordered_rows[0].keys()
        if not all([row.keys() == correct_keys for row in ordered_rows]):
            raise Exception("Inconsistent fields: {}.".format(ordered_rows))

        # Backticks critical for avoiding collisions with MySQL reserved words,
        # e.g. 'condition'!
        query_string = 'INSERT INTO `{}` (`{}`) VALUES ({})'.format(
            table,
            '`, `'.join(correct_keys),
            ', '.join(['%s'] * len(correct_keys)),
        )

        # MySQLdb expects a tuple or a list of tuples for the values.
        value_tuples = [tuple(row.values()) for row in ordered_rows]
        if len(row_dicts) is 1:
            insert_method = 'execute'
            params = value_tuples[0]
        else:
            insert_method = 'executemany'
            params = value_tuples

        self._cursor_retry_wrapper(insert_method, query_string, params)

        self._commit()

    def update_row(self, table, id_col, id, **params):
        """UPDATE a row by id, assumed to be unique key."""
        query_string = 'UPDATE `{}` SET {} WHERE `{}` = %s'.format(
            table,
            ', '.join(['`{}` = %s'.format(k) for k in params.keys()]),
            id_col
        )

        p = params.values()
        p.append(id)

        self.query(query_string, param_tuple=tuple(p))

        self._commit()
