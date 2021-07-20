var express = require('express');
const bodyParser = require('body-parser');
var cors = require('cors')

var production_action = require('./prod2/actions.js');
var auth = require('./prod2/auth.js')

var automated_tasks = require('./prod2/automated_tasks')

var app = express();
app.options('*', cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));



var timestamp_endpoints = [{
	url: 'getSeriesData',
	action: 'get_allSeriesData'
}, {
	url: 'newSeries',
	action: 'post_newSeries'

}, {
	url: 'getEpisodeData',
	action: 'get_allEpisodeData'
}, {
	url: 'newEpisode',
	action: 'post_newEpisode'

}, {
	url: 'updateEpisode',
	action: 'post_updateEpisode',
	post: true

}, {
	url: 'getCharacterData',
	action: 'get_allCharacterData'
}, {
	url: 'newCharacter',
	action: 'post_newCharacter'

}, {
	url: 'getCategoryData',
	action: 'get_allCategoryData'
}, {
	url: 'newCategory',
	action: 'post_newCategory'

}, {
	url: 'getTimestampData',
	action: 'get_allTimestampData'
}, {
	url: 'newTimestamp',
	action: 'post_newTimestamp'

}, {
	url: 'massAddTimestamps',
	action: 'post_massAddTimestamp',
	post: true

}, {
	url: 'updateTimestamp',
	action: 'post_updateTimestamp'

}, {
	url: 'getCompilationData',
	action: 'get_allCompilationData'
}, {
	url: 'newCompilation',
	action: 'post_newCompilation',
	post: true
}, {
	url: 'getCompilationDescription',
	action: 'get_compilationDescription'
}];

app.all('*', function(req, res, next) {
	var origin = req.get('origin');
	res.header('Access-Control-Allow-Origin', origin);
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	next();
});



timestamp_endpoints.forEach(function(endpoint) {
	var endpointFunction = function(req, res) {
		var params = (endpoint.post ? req.body : req.query)
		var baton = production_action._getBaton(endpoint.url, params, res)
		if (endpoint.post) baton.requestType = 'POST'
		auth.authValidate(baton, req, function() {
			production_action.validateRequest(baton, params, endpoint.url, function(updated_params) {
				if (updated_params) production_action[endpoint.action](baton, updated_params, res);
			})
		})
	}
	if (endpoint.post) {
		app.post('/' + endpoint.url, endpointFunction);
		return
	}
	app.get('/' + endpoint.url, endpointFunction);
})

var user_endpoints = [{
	url: 'createUser',
	action: 'createUser'
}, {
	url: 'login',
	action: 'login'
}, {
	url: 'permission',
	action: 'permission'
}, {
	url: 'validate',
	action: 'get_authValidate'
}]

user_endpoints.forEach(function(endpoint) {

	var endpointFunction = function(req, res) {
		var baton = production_action._getBaton(endpoint.url, null, res)
		auth[endpoint.action](baton, req)
	}
	app.get('/' + endpoint.url, endpointFunction);
})



var server = app.listen(process.env.PORT || 8081, function() {
	console.log("Scene Stamp Server Running @ port ", this.address().port)

	startIntervalTasks()
})


var startIntervalTasks = () => {
	if (process.env.NODE_ENV === 'production') {
		//setInterval(() => automated_tasks._updateActiveNBAGames(), 1000 * 60 * 60)
		//setInterval(() => automated_tasks._updateActivePlayers(), 1000 * 60 * 60)
		//setInterval(() => automated_tasks._updateActiveGameTimestamps(), 10000)
		//setInterval(() => automated_tasks._updateTodayGamePlaysWithTimestamp(), 10000)
	}
}

module.exports = {
	server: server,
	startIntervalTasks: startIntervalTasks,
}