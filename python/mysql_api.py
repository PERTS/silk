connection = None
    cursor = None

    # Configurable on instantiation.
    production_instance = None  # Cloud SQL instance name in project.
    production_user = 'root'
    local_user = None
    local_password = None
    local_ip = '127.0.0.1'
    local_port = 3306
    db_name = None

    def __init__(self, **kwargs):
        keys = ['production_instance', 'production_user', 'local_user',
                'local_password', 'local_ip', 'local_port', 'db_name']
        for k in keys:
            v = kwargs.get(k, None)
            if v:
                setattr(self, k, v)

        self.connect_to_db()
        self.cursor = self.connection.cursor()

    # This is safe as long as the class does not hold any circular references.
    # http://eli.thegreenplace.net/2009/06/12/safely-using-destructors-in-python
    def __del__(self):
        self.connection.close()

    def connect_to_db(self):
        """Establish connection to MySQL db instance.

        Either Google Cloud SQL or local MySQL server. Detects environment with
        functions from util module.
        """
        if util.is_localhost():
            credentials = {
                'host': self.local_ip,
                'port': self.local_port,
                'db': self.db_name,
                'user': self.local_user,
                'passwd': self.local_password
            }
        else:
            credentials = {
                'unix_socket': '/cloudsql/{app_id}:{db_instance}'.format(
                    app_id=app_identity.get_application_id(),
                    db_instance=self.production_instance),
                'db': self.db_name,
                'user': self.production_user,
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

    def table_columns(self, table):
        result = self.query("SHOW columns FROM %s", (table,))
        return [columns[0] for column in result]

    def query(self, query_string, param_tuple=tuple(), n=None):
        """Run a general-purpose query. Returns a tuple of tuples."""
        self.cursor.execute(query_string, param_tuple)
        if n is None:
            return self.cursor.fetchall()
        else:
            return self.cursor.fetchmany(n)

    def select_query(self, query_string, param_tuple=tuple(), n=None):
        """Extends .query() by making results more convenient.

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

    def select_query_single_value(self, query_string, param_tuple=tuple()):
        """Returns the first value of the first row of results, or None."""
        self.cursor.execute(query_string, param_tuple)
        result = self.cursor.fetchone()

        # result is None if no rows returned, else a tuple.
        return result if result is None else result[0]

    def _commit(self):
        """Must be called for INSERT and UPDATE queries or they won't work."""
        try:
            self.connection.commit()
        except MySQLdb.Error as e:
            logging.error("MySQLdb error on INSERT. Will be rolled back. "
                          "{}".format(e))
            logging.error("Last query run was:\n{}"
                          .format(self.cursor._last_executed))
            self.connection.rollback()
            success = str(e)
        else:
            success = True

        return success

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

        getattr(self.cursor, insert_method)(query_string, params)

        return self._commit()