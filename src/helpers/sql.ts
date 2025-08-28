// The SqlStatement type is a simple object that holds a SQL statement and its parameters
export type SqlStatement = { sql: string, params: any[] };

/**
 * This is a function to automatically convert any SQL query with named parameters into a SqlStatement object
 * This is meant to be used as a template tag for a template string, so sql`select * from table where id = ${id}` for example
 */
export function sql(strings: TemplateStringsArray, ...keys: any[]) {
	let sqlOutput = '';
	for (let i = 0; i < strings.length; i++) {
		sqlOutput += strings[i];
		if (i < (strings.length - 1)) sqlOutput += '$' + (i + 1);
	}
	return { sql: sqlOutput, params: keys };
}