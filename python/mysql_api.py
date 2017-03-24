"""Convenience wrapper for MySQLdb."""

import collections
import google.appengine.api.app_identity as app_identity
import logging
import MySQLdb
import time

import util


class MySQLApi(object):
    """Given credentials, connects to a Cloud SQL instance and simplifies
    various kinds of queries. Use `with` statement to ensure connections are
    correctly closed.

    Example:

    with Api(**credentials) as mysql_api:
        result = mysql_api.select_star_where('checkpoint', status='incomplete')

    N.B. Does _not_ pool/cache connections, b/c:

    > We recommend that a new connection is created to service each HTTP
    > request, and re-used for the duration of that request (since the time to
    > create a new connection is similar to that required to test the liveness
    > of an existing connection).

    https://groups.google.com/forum/#!topic/google-cloud-sql-discuss/sS38Nh7MriY
    """

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

    def __enter__(self):
        self.connect_to_db()
        return self

    def __exit__(self, type, value, traceback):
        self.connection.close()

    def _cursor_retry_wrapper(self, method_name, query_string, param_tuple):
        """Wrap the normal cursor.execute from MySQLdb with a retry.

        Args:
            method_name     str, either 'execute' or 'executemany'
        """
        tries = 0
        exceptions = (MySQLdb.ProgrammingError, MySQLdb.OperationalError,
                      MySQLdb.InterfaceError)
        while True:
            try:
                # Either execute or execute_many
                getattr(self.cursor, method_name)(query_string, param_tuple)
                break  # call succeeded, don't try again
            except exceptions as e:
                # Log the error and try again. Close the problematic connection
                # and make a new one.
                logging.error("MySQLApi caught an exception and will retry.")
                logging.error(e)
                self.connection.close()
                self.connect_to_db()
            tries += 1
            if tries >= self.num_tries:
                # That's enough tries, just throw an error.
                raise Exception("Recurrent MySQLdb.ProgrammingError, gave up.")
            # Sleep interval between tries backs off exponentially.
            # N.B. retry interval is in ms while time.sleep() takes seconds.
            time.sleep(2 ** (tries - 1) * self.retry_interval_ms / 1000)

    def _cursor_execute(self, query_string, param_tuple):
        self._cursor_retry_wrapper('execute', query_string, param_tuple)

    def _cursor_executemany(self, query_string, param_tuple):
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

    def select_star_where(self, table, order_by=None, limit=100, offset=None,
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

        query = """
            SELECT *
            FROM `{table}`
            WHERE {where}
            {order_by}
            LIMIT {offset}{limit}
        """.format(
            table=table,
            where=' AND '.join(where_clauses),
            order_by='ORDER BY `{}`'.format(order_by) if order_by else '',
            offset='{},'.format(offset) if offset else '',
            limit=limit,
        )

        return self.select_query(query, values)

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
            raise MySQLdb.Error("Last query will be rolled back. {}".format(e))

    def insert_row_dicts(self, table, row_dicts,
                         on_duplicate_key_update=None):
        """Insert one record or many records.

        Args:
            table: str name of the table
            row_dicts: a single dictionary or a list of them
            on_duplicate_key_update: tuple of the fields to update in the
                existing row if there's a duplicate key error.

        Returns: True on success and an error message string on error.
        """
        # Standardize to list.
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

        if on_duplicate_key_update:
            # Add the extra query syntax. This tells MySQL: when you encounter
            # an inserted row that would result in a duplicate key, instead do
            # an UPDATE on the existing row. The values set are: for each field
            # named in on_duplicate_key_update, pull the corresponding value
            # from VALUES.
            # N.B. This is better than INSERT IGNORE because it records the new
            # data and doesn't ignore other unrelated errors, and it's better
            # than REPLACE INTO because that deletes the existing row and
            # inserts a new one, which is a bigger disturbance to the indexes
            # and can mess up the last inserted id.
            # http://stackoverflow.com/a/21419029/385132
            # http://stackoverflow.com/questions/2366813/on-duplicate-key-ignore
            query_string += ' ON DUPLICATE KEY UPDATE {}'.format(
                ', '.join(
                    ['`{field}` = VALUES(`{field}`)'.format(field=f)
                     for f in on_duplicate_key_update]
                )
            )

        self._cursor_retry_wrapper(insert_method, query_string, params)

        self._commit()

    def update_row(self, table, id_col, id, **params):
        """UPDATE a row by id, assumed to be unique key."""
        query_string = 'UPDATE `{}` SET {} WHERE `{}` = %s'.format(
            table,
            ', '.join(['`{}` = %s'.format(k) for k in params.keys()]),
            id_col,
        )

        p = params.values()
        p.append(id)

        self.query(query_string, param_tuple=tuple(p))

        self._commit()
