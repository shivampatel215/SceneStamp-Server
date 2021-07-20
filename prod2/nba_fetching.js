var actions = require('./actions')
var req = require('request')
var request = req.defaults()
var moment = require('moment-timezone')
const Nightmare = require('nightmare')

const NBA_MAIN_SITE = 'http://www.nba.com'
const NBA_DATA_SITE = 'http://data.nba.net'
const NBA_PLAYERS_URL = NBA_MAIN_SITE + '/players/active_players.json'
const BASE_NBA_PLAY_BY_PLAY = 'http://data.nba.com/data/10s/v2015/json/mobile_teams/nba/2019/scores/pbp/'
const BASE_PBP_WITH_TIMESTAMP = 'https://stats.nba.com/stats/playbyplayv2?GameId='


module.exports = {

	NBA_MAIN_SITE: NBA_MAIN_SITE,
	NBA_PLAYERS_URL: NBA_PLAYERS_URL,
	BASE_NBA_PLAY_BY_PLAY: BASE_NBA_PLAY_BY_PLAY,
	BASE_PBP_WITH_TIMESTAMP: BASE_PBP_WITH_TIMESTAMP,

	getNbaPbpWithTimestamps(game_id) {
		return BASE_PBP_WITH_TIMESTAMP + game_id + '&StartPeriod=0&EndPeriod=14'
	},

	getNbaPlayByPlayUrl(game_id) {
		return BASE_NBA_PLAY_BY_PLAY + game_id + '_full_pbp.json'
	},

	getNbaGamesForMonthUrl() {
		var currentDate = new Date();
		return NBA_DATA_SITE + "/v2015/json/mobile_teams/nba/" + currentDate.getFullYear() + "/league/00_league_schedule_" + (currentDate.getMonth() + 1 < 10 ? '0' + currentDate.getMonth() + 1 : currentDate.getMonth() + 1) + ".json"
	},

	getGameSchedule(baton, callback) {
		var t = this;
		baton.addMethod('getGameSchedule')

		var formatToUtcTime = (date, time) => {
			return date + ' ' + time + ':00 UTC'
		}

		var formatRawData = (raw_data) => {

			if (raw_data === null) {
				return []
			}

			return raw_data.mscd.g.map(game => {
				return {
					nba_game_id: game.gid,
					episode_name: (game.gcode.split('/')[1] + game.gdte),
					nba_start_time: formatToUtcTime(game.gdtutc, game.utctm)
				}
			})
		}

		this._makeHttpCallWithUrl(baton, this.getNbaGamesForMonthUrl(), raw_data => {
			callback(formatRawData(raw_data))
		})
	},

	getTimestamps(baton, episodes, character_data, callback) {
		baton.addMethod('getTimestamps')

		var formatRawData = (ep, raw_data, callback) => {

			var getCategoryId = (playType, desc) => {
				if (playType === 1) {
					return (desc.includes('3pt Shot: Made') ? 3 : 2)
				} else {
					return playType
				}
			}

			if (raw_data === null || !Array.isArray(raw_data.g.pd)) {
				callback([])
				return
			}

			callback([].concat.apply([], raw_data.g.pd.map(period => period.pla.map(play => {
				var correlatedCharacterId = character_data.find(char => char.nba_player_id === play.pid)
				return {
					episode_id: ep.episode_id,
					start_time: -1,
					nba_timestamp_id: ep.nba_game_id + '.' + play.evt,
					nba_play_description: play.cl + " | " + play.de,
					character_id: (correlatedCharacterId !== undefined ? [correlatedCharacterId.character_id] : []),
					category_id: [getCategoryId(play.etype, play.de)]
				}
			}))).sort((a, b) => {
				return a.nba_timestamp_id - b.nba_timestamp_id
			}))
		}

		var filterandReformat = (timestamps, callback) => {
			callback(timestamps.map(ts => {

				return ts
			}))
		}

		var timestamps = []
		episodes.forEach((ep, index) => {
			this._makeHttpCallWithUrl(baton, this.getNbaPlayByPlayUrl(ep.nba_game_id), raw_data => {
				formatRawData(ep, raw_data, formatted_data => {
					timestamps = timestamps.concat(formatted_data)
					if (index === episodes.length - 1) callback(timestamps)
				})
			})
		})
	},

	getTimestampedPlays(baton, episodes, suc_callback) {
		baton.addMethod('getTimestampedPlays')

		var formatRawData = (episode, raw_data, callback) => {

			var convertStringToEpochTime = (string) => {
				var today = new Date(episode.nba_start_time)
				var splitString = string.substring(0, 5)
				var hour = parseInt(splitString.split(':')[0]) + (string.substring(5, 8).trim() === 'PM' ? 12 : 0)
				var playUtcTime = moment([today.getFullYear(), today.getMonth(), today.getDate(), hour, splitString.split(':')[0], 0, 0]).subtract(3, 'hours').valueOf()
				return playUtcTime
			}

			if (raw_data === null || !Array.isArray(raw_data.resultSets[0].headers) || !Array.isArray(raw_data.resultSets[0].rowSet)) {
				callback([])
				return
			}

			var playNumIndex = raw_data.resultSets[0].headers.indexOf('EVENTNUM')
			var playTimestampIndex = raw_data.resultSets[0].headers.indexOf('WCTIMESTRING')

			callback(raw_data.resultSets[0].rowSet.map(play => {
				return {
					nba_timestamp_id: episode.nba_game_id + '.' + play[playNumIndex],
					start_time: convertStringToEpochTime(play[playTimestampIndex]) - episode.nba_start_time
				}
			}))
		}

		var timestamps = []
		episodes.forEach((ep, index) => {
			this._makeHttpCallWithUrl(baton, this.getNbaPbpWithTimestamps(ep.nba_game_id), raw_data => {
				formatRawData(ep, raw_data, (formatted_timestamps) => {
					timestamps = timestamps.concat(formatted_timestamps)
					if (index === episodes.length - 1) {
						suc_callback(timestamps)
					}
				})
			})
		})
	},


	getActivePlayers(baton, callback) {
		var t = this;
		baton.addMethod('getActivePlayers')

		var formatRawData = (raw_data) => {
			if (raw_data === null) {
				return []
			}
			return raw_data.map(player => {
				return {
					character_name: player.firstName + ' ' + player.lastName,
					nba_player_id: parseInt(player.personId)
				}
			})
		}

		this._makeHttpCallWithUrl(baton, 'http://www.nba.com/players/active_players.json', raw_data => {
			callback(formatRawData(raw_data))
		})
	},

	_makeHttpCallWithUrl(baton, url, callback) {
		baton.addMethod('_makeHttpCallWithUrl')
		var chunks = ''

		options = {
			"method": "GET",
			"url": url,
			"forever":true,
			"pool": {"maxSockets": Infinity}
		}
		if(url.includes('stats.nba.com')){
			options.headers = {
				"Referer":"https://stats.nba.com/game/0021900112/playbyplay"
			}
		}
		request(options, (err, response) => {
			if (err) {
				baton.setError(err)
				callback(null)
				return
			} 
			else if(response.statusCode !== 200){
				callback(null)
				return
			}else {
				callback(JSON.parse(response.body))
			}
		});

	},


	_batonErrorExit(baton) {
		if (baton.automated_task_name) baton.done(baton.err[0])
		else actions._generateError(baton)
	}
}