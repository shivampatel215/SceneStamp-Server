var mysql = require('mysql');


var MAIN_POOLS = {
	//aws credentials
	pool: mysql.createPool({
		connectionLimit: 9,
		host: "database-1.cdolegs6ibeo.us-east-2.rds.amazonaws.com",
		user: "admin",
		password: "TimestampDatabase101",
		database: "ss-timestamp-2"
	}),
	user_pool: mysql.createPool({
		connectionLimit: 9,
		host: "database-1.cdolegs6ibeo.us-east-2.rds.amazonaws.com",
		user: "admin",
		password: "TimestampDatabase101",
		database: "ss-timestamp-2"
	})/*
	pool: mysql.createPool({		
		connectionLimit: 9,			
		host: "us-cdbr-iron-east-02.cleardb.net",
		user: "ba52740f8673f9",			
		password: "6704fa0a",			
		database: "heroku_2648a9aa380b8d4"
	}),		
	user_pool: mysql.createPool({		
		connectionLimit: 9,			
		host: "us-cdbr-iron-east-02.cleardb.net",
		user: "ba52740f8673f9",			
		password: "6704fa0a",			
		database: "heroku_2648a9aa380b8d4"
	}),*/		
	
}
var VIDEO_SERVER_URL = 'http://ubuntu@ec2-18-221-3-92.us-east-2.compute.amazonaws.com'
var VIDEO_SERVER_PORT = 8081

var pools = MAIN_POOLS


var ELASTIC_SEARCH_URL = 'https://elastic:3xzBdhJ4ZeVzNiEQas8xOeep@becc9ba4003e4832aff6237b9a3301f3.us-east-1.aws.found.io:9243'


module.exports = {

	// above for testing only
	pools: pools,
	pool: pools.pool,
	user_pool: pools.user_pool,
	VIDEO_SERVER_URL: VIDEO_SERVER_URL,
	VIDEO_SERVER_PORT: VIDEO_SERVER_PORT,

	ELASTIC_SEARCH_URL: ELASTIC_SEARCH_URL

}