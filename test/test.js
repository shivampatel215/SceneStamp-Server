var assert = require('assert');
const expect = require('chai').expect;
var sinon = require('sinon')
var chai = require('chai')
var chaiHttp = require('chai-http');
var nock = require('nock')
var bcrypt = require('bcrypt')
var jwt = require('jsonwebtoken')
var AccessControl = require('accesscontrol')
var winston = require('winston')
var moment = require('moment')

var server = require('../index').server

chai.use(chaiHttp);

var batonHandler = require('../prod2/baton')
var actions = require('../prod2/actions')
var dbActions = require('../prod2/database_actions')
var auth = require('../prod2/auth')
var cred = require('../prod2/credentials')
var nbaFetching = require('../prod2/nba_fetching')
var endpointRequestParams = require('../prod2/endpointRequestParams')
var automated_tasks = require('../prod2/automated_tasks')


function assertErrorMessage(res, msg, custom, expectedErrorCode) {
	expect((custom == true ? res.endStatus : res.status)).to.equal((expectedErrorCode ? expectedErrorCode : 500))
	expect((custom == true ? res.data : res.body)).to.have.property('error_message')
	expect((custom == true ? res.data : res.body).error_message).to.equal(msg)
}

function assertSuccess(res, post) {
	expect(res.status).to.equal((post ? 201 : 200))
}

var TIMEOUT = 100;
var EXTENDED_TIMEOUT = 500;


describe('timestamp server tests', function() {

	function sendRequest(path, params, post, headers) {

		var addHeaders = req => {
			if (headers !== undefined) {
				Object.keys(headers).forEach(head => {
					req.set(head, headers[head])
				})
			}
			return req
		}

		return (post ?
			addHeaders(chai.request(server).post('/' + path).set('content-type', 'application/json')).send(params) :
			addHeaders(chai.request(server).get('/' + path + '?' + Object.keys(params).map(attr => {
				return attr + '=' + params[attr]
			}).join('&'))).send())

	}

	/*  getting data calls
		
		for series/episode/character/category/timestamp

		also test filtering
	*/
	var sandbox;

	var fakeReq;
	var fakeRes;

	var fakeSeriesData;
	var fakeEpisodeData;
	var fakeCharacterData;
	var fakeCategoryData;
	var fakeCompilationData;
	var fakeCompilationTimestampData;

	//fake nba
	var fakeNbaGameScheduleData;
	var fakeNbaPlayerData;
	var getFakePlayByPlayJsonData;


	beforeEach(function() {

		sandbox = sinon.createSandbox()

		fakeRes = {
			data: null,
			endStatus: null,
			status: function(endStatus) {
				this.endStatus = endStatus
				return this
			},
			json: function(data) {
				this.data = data;
			}
		}

		//req body to test the auth 
		//can't use the chai http , since we are not makking a endpoint call and simple calling a function 
		fakeReq = {
			headers: {},
			body: {},
			get(attr) {
				return this.headers[attr]
			}
		}

		fakeSeriesData = [{
			"series_id": 0,
			"series_name": "Test Series 1"
		}, {
			"series_id": 1,
			"series_name": "Test Series 2"
		}]

		fakeEpisodeData = [{
			"episode_id": 1,
			"episode_name": "Test Episode 1",
			"air_date": 1564034876,
			"series_id": 0
		}, {
			"episode_id": 2,
			"episode_name": "Test Episode 2",
			"air_date": 1564038876,
			"series_id": 1
		}, {
			"episode_id": 3,
			"episode_name": "Test Episode 3",
			"air_date": 1569038876
		}, {
			"episode_id": 4,
			"episode_name": "Test Episode 4",
			"youtube_id": 'hvTKfVQWU40'
		}, {
			"episode_id": 5,
			"episode_name": "Test Episode 5",
			"nba_start_time": '7:00:00', //PST miltary time of the start time of game; specific to test ONLY
			"nba_game_id": '10001' //the start time matches with the EST time of the plays in the timestamped plays
		}, {
			"episode_id": 6,
			"episode_name": "Test Episode 6",
			"nba_start_time": '14:05:00', //PSTmiltary time of the start time of game; specific to test ONLY
			"nba_game_id": '20001' //the start time matches with the EST time of the plays in the timestamped plays
		}];

		fakeCharacterData = [{
			"character_name": "Character 1",
			"character_id": 1
		}, {
			"character_name": "Character 2",
			"character_id": 2
		}, {
			"character_name": "Character 3",
			"character_id": 3
		}, {
			"character_name": "Character 4",
			"character_id": 4
		}, {
			character_name: 'Intest nba player 1',
			nba_player_id: 10001,
			character_id: 5
		}];

		fakeCategoryData = [{
			"category_id": 0,
			"category_name": "Category 0"
		}, {
			"category_id": 1,
			"category_name": "Category 1"
		}, {
			"category_id": 2,
			"category_name": "Category 2"
		}];

		fakeTimestampData = [{
			"timestamp_id": 0,
			"start_time": 0,
			"episode_id": 1
		}, {
			"timestamp_id": 1,
			"start_time": 0,
			"episode_id": 1
		}, {
			"timestamp_id": 3,
			"start_time": 0,
			"episode_id": 2
		}, {
			"timestamp_id": 4,
			"start_time": 0,
			"episode_id": 2
		}, {
			"timestamp_id": 5,
			"start_time": -1, // this is the default start time for all timestamps w/ nba linking
			"episode_id": 2,
			"nba_game_id": 20001,
			"nba_timestamp_id": "20001.6"
		}];

		fakeTimestampCategoryData = [{
			"timestamp_id": 3,
			"category_id": 0
		}, {
			"timestamp_id": 4,
			"category_id": 0
		}];

		fakeTimestampCharacterData = [{
			"timestamp_id": 1,
			"character_id": 1
		}, {
			"timestamp_id": 4,
			"character_id": 1
		}]

		fakeUserData = [{
			user_id: 101,
			username: 'user_1',
			password: 'pass_1',
			email: 'email1@email.com',
			auth_token: 'auth_token_1'
		}, {
			user_id: 102,
			username: 'user_2',
			password: 'pass_2',
			email: 'email2@email.com',
			auth_token: 'auth_token_2'
		}];

		fakeNbaGameScheduleData = {
			mscd: {
				g: [{
					gid: '10001', //episode in fakeepisodedata has this gameid
					gcode: "20191004/HOULAC",
					"gdte": "2019-10-04",
					"gdtutc": "2019-10-04",
					"utctm": "05:00",
				}, {
					gid: '10002',
					gcode: "20191005/HOULAK",
					"gdte": "2019-10-05",
					"gdtutc": "2019-10-05",
					"utctm": "01:00",
				}, {
					gid: '10003',
					gcode: "20191005/CELLAK",
					"gdte": "2019-12-10",
					"gdtutc": "2019-12-10",
					"utctm": "10:30",
				}]
			}
		}

		fakeNbaPlayerData = [{
			firstName: 'Intest nba', //this player is already in the fakecharacterdata
			lastName: 'player 1',
			personId: '10001'
		}, {
			firstName: 'Intest nba',
			lastName: 'player 2',
			personId: '10002'
		}, {
			firstName: 'Intest nba',
			lastName: 'player 3',
			personId: '10003'
		}]

		fakePlayByPlayData = {
			10001: [{
				evt: 1,
				cl: '12:00',
				de: 'InTest 10001 tipoff',
				pid: 10001,
				etype: 12
			}, {
				evt: 2,
				cl: '12:02',
				de: 'Made shot',
				pid: 10002,
				etype: 1
			}],
			20001: [{
				evt: 5,
				cl: '12:00',
				de: '3pt Shot: Made',
				pid: 40001,
				etype: 1
			}, {
				evt: 3,
				cl: '11:57',
				de: 'InTest 2001 tipoff',
				pid: 30001, //pid isn't linked to fakeCharacterData, but will do since only testing
				etype: 12 //if timestamp & timestamp category/characters are inserted
			}, {
				evt: 6, // this timestamp should already exists in fake timestamp
				cl: '11:51',
				de: '3pt Shot: Made',
				pid: 40001,
				etype: 1
			}]
		}

		getFakePlayByPlayJsonData = (game_id) => {
			return {
				g: {
					pd: [{
						p: 1,
						pla: fakePlayByPlayData[game_id].slice(0, fakePlayByPlayData[game_id] / 2)
					}, {
						p: 2, //period 2
						pla: fakePlayByPlayData[game_id].slice(fakePlayByPlayData[game_id] / 2)
					}]
				}
			}
		}

		fakePbpTimestamp = {
			10001: [{
				EVENTNUM: 1,
				WCTIMESTRING: "10:02 PM" //est time of the play occurance
			}, {
				EVENTNUM: 2,
				WCTIMESTRING: "10:04 PM"
			}, ],
			20001: [{
				EVENTNUM: 5,
				WCTIMESTRING: "5:10 PM"
			}, {
				EVENTNUM: 3,
				WCTIMESTRING: "5:00 PM"
			}, {
				EVENTNUM: 6,
				WCTIMESTRING: "5:12 PM"
			}]
		}

		getFakePbpTimestampData = (game_id) => {
			return {
				resultSets: [{
					headers: [
						'EVENTNUM',
						'WCTIMESTRING'
					],
					rowSet: fakePbpTimestamp[game_id].map(play => {
						return [play.EVENTNUM, play.WCTIMESTRING]
					})
				}]
			}
		}


		sandbox.stub(auth, 'authValidate').callsFake(function(baton, req, callback) {
			callback()
		})

		sandbox.stub(auth, '_validateRole').callsFake((baton, params, role_id, callback) => {
			callback()
		})

		sandbox.stub(actions, '_generateId').callsFake(function() {
			return 10
		})

	});

	afterEach(function() {
		sandbox.restore()
		nock.cleanAll()
	})

	describe('automated tasks', function() {


		beforeEach(function() {


			sandbox.stub(batonHandler, 'createAutomatedBaton').callsFake(function(endpoint, params, res) {
				var baton = batonHandler.createAutomatedBaton.wrappedMethod.apply(this, arguments)
				fakeBaton = baton;
				return baton
			})
		})


		describe('nba plays', () => {

			var universal_timestamps;

			var validNbaPlayByPlay = () => {
				nock(nbaFetching.BASE_NBA_PLAY_BY_PLAY + '10001').get(/.*/).reply(200, getFakePlayByPlayJsonData(10001))
				nock(nbaFetching.BASE_NBA_PLAY_BY_PLAY + '20001').get(/.*/).reply(200, getFakePlayByPlayJsonData(20001))
			}

			var emptyNbaPlayByPlay = () => {
				nock(nbaFetching.BASE_NBA_PLAY_BY_PLAY + '10001').get(/.*/).reply(200, {
					g: {
						pd: []
					}
				})
				nock(nbaFetching.BASE_NBA_PLAY_BY_PLAY + '20001').get(/.*/).reply(200, {
					g: {
						pd: []
					}
				})
			}

			var setAllTimestampsToReg = () => {
				//hardcorded values of the nba timestamp id from fakeNbaPlayData
				['10001.1', '10001.2', '20001.5', '20001.3', '20001.6'].forEach((nti, index) => {
					fakeTimestampData[index].nba_timestamp_id = nti
					fakeTimestampData[index].start_time = -1
				})
			}

			var validNbaPbpTimestamp = () => {
				nock(nbaFetching.BASE_PBP_WITH_TIMESTAMP + '10001').get(/.*/).reply(200, getFakePbpTimestampData(10001))
				nock(nbaFetching.BASE_PBP_WITH_TIMESTAMP + '20001').get(/.*/).reply(200, getFakePbpTimestampData(20001))
			}

			var getTimestampDbVersion = (ep, timestamp_id, raw_play_data) => {

				var getCategoryId = (playType, desc) => {
					if (playType === 1) {
						return (desc.includes('3pt Shot: Made') ? 3 : 2)
					} else {
						return playType
					}
				}

				var correlatedCharacterId = fakeCharacterData.find(char => char.nba_player_id === raw_play_data.pid)

				return {
					episode_id: ep.episode_id,
					timestamp_id: timestamp_id,
					start_time: -1,
					nba_timestamp_id: ep.nba_game_id + '.' + raw_play_data.evt,
					nba_play_description: raw_play_data.cl + " | " + raw_play_data.de,
					character_id: (correlatedCharacterId !== undefined ? [correlatedCharacterId.character_id] : []),
					category_id: [getCategoryId(raw_play_data.etype, raw_play_data.de)]
				}

			}

			beforeEach(() => {

				universal_timestamps = [10, 20, 30, 40, 50, 60, 70, 80]

				actions._generateId.restore()
				sandbox.stub(actions, '_generateId').callsFake((len) => {
					return (len === 10 ? 10000 : universal_timestamps.shift())
				})

				//updating the start time of all ep with nba start time s.t. they appear as 'active game today'
				fakeEpisodeData.map(ep => {
					if (ep.nba_start_time !== undefined) {

						var today = new Date()
						var splitString = ep.nba_start_time.split(':')
						ep.nba_start_time = moment([today.getFullYear(), today.getMonth(), today.getDate(), splitString[0], splitString[1], splitString[2], 0]).valueOf()
					}
					return ep
				})


				//stub get all series data for all tests
				//for the test purpose, this is only called to filter by the time to get the active games
				//return back all episodes with nba_start_times
				sandbox.stub(dbActions, 'getAllEpisodeData').callsFake(function(baton, queryData, callback) {

					callback(fakeEpisodeData.filter(ep => ep.nba_start_time))
				})


				//stub get all timestamp data for all tests
				//only need to filter by nba timestamp id
				sandbox.stub(dbActions, 'getAllTimestampData').callsFake(function(baton, data, callback) {
					var results = [...fakeTimestampData].filter(timestamp => {
						return (data.nba_timestamp_id && data.nba_timestamp_id.length > 0 ? data.nba_timestamp_id.includes(timestamp.nba_timestamp_id) : true)
					})
					callback(results)
				})


				//insert timestmaps
				//NOTE; in the test, we will check if each ts has the category/character ids ; 
				//in prod, the database insert multiple query will filter these values
				//for these tests, we will insert those attr with this stub, and will assert it exists
				sandbox.stub(dbActions, 'insertTimestamp').callsFake(function(baton, values, callback) {
					fakeTimestampData = fakeTimestampData.concat(values)
					callback(values)
				})

				sandbox.stub(dbActions, 'updateTimestamps').callsFake(function(baton, values, condition_attr, callback) {
					var changing_attr = Object.keys(values[0]).find(attr => attr !== condition_attr)

					fakeTimestampData.map(fake_ts => {
						var correspondingValues = values.find(ts => ts[condition_attr] === fake_ts[condition_attr])
						if (correspondingValues !== undefined) {
							fake_ts[changing_attr] = correspondingValues[changing_attr]
						}
					})
					callback()
				})

				sandbox.stub(dbActions, 'insertTimestampCharacter').callsFake(function(baton, values, callback) {
					fakeTimestampCharacterData = fakeTimestampCharacterData.concat(values)
					callback(values)
				})

				sandbox.stub(dbActions, 'insertTimestampCategory').callsFake(function(baton, values, callback) {
					fakeTimestampCategoryData = fakeTimestampCategoryData.concat(values)
					callback(values)
				})

				sandbox.stub(dbActions, 'getAllCharacterData').callsFake(function(baton, queryParams, callback) {
					callback(fakeCharacterData)
				})

			})


			it('should fetch and insert new nba plays for active games', (done) => {

				this.timeout(5000)
				validNbaPlayByPlay()


				var allPossibleTimestamp = [...universal_timestamps]
				var allActiveEpisodes = fakeEpisodeData.filter(ep => ep.nba_start_time !== undefined).sort((a, b) => a.nba_game_id - b.nba_game_id) //get all active nba games, sort them by nba game id
				var expectedDbVersionTimestamps = [].concat.apply(
						[], allActiveEpisodes.map( //for all nba games that currently are active
							ep => fakePlayByPlayData[ep.nba_game_id]
							.sort((a, b) => a.evt - b.evt) //sort by play evt
							.map(raw_ts => getTimestampDbVersion(ep, allPossibleTimestamp.shift(), raw_ts)))) //get the db formatted version of play with the timestamp 
					.filter(ts => !fakeTimestampData.map(reg_ts => reg_ts.nba_timestamp_id).includes(ts.nba_timestamp_id))
				automated_tasks._updateActiveGameTimestamps((fakeBaton) => {

					expectedDbVersionTimestamps.forEach(expectedTs => {
						expect(fakeTimestampData).to.deep.contains(expectedTs);
						expectedTs.category_id.forEach(cat_id => {
							expect(fakeTimestampCategoryData).to.deep.contain({
								timestamp_id: expectedTs.timestamp_id,
								category_id: cat_id
							})
						})
						expectedTs.character_id.forEach(char_id => {
							expect(fakeTimestampCharacterData).to.deep.contain({
								timestamp_id: expectedTs.timestamp_id,
								character_id: char_id
							})
						})
					})
					expect(fakeBaton.additionalData.added_nba_timestamps).to.deep.equal(expectedDbVersionTimestamps.length)
					done()
				})
			})

			it('should stop if nba plays are empty', (done) => {

				this.timeout(5000)
				emptyNbaPlayByPlay()

				automated_tasks._updateActiveGameTimestamps((fakeBaton) => {
					expect(fakeBaton.additionalData.no_timestamps_to_add).to.equal(true)
					done()
				})
			})

			it('should stop if no new nba plays to add', (done) => {
				this.timeout(5000)
				setAllTimestampsToReg()

				automated_tasks._updateActiveGameTimestamps((fakeBaton) => {
					expect(fakeBaton.additionalData.no_timestamps_to_add).to.equal(true)
					done()
				})
			})

			it('should get pbp data with timestamp', (done) => {
				this.timeout(5000)
				validNbaPbpTimestamp()
				setAllTimestampsToReg()

				automated_tasks._updateTodayGamePlaysWithTimestamp((fakeBaton) => {
					expect(fakeBaton.additionalData.updated_nba_timestamps).to.deep.equal(fakeTimestampData.map(ts => ts.nba_timestamp_id))
					done()
				})

			})

			it('should get pbp data with timestamp when not all reg timestamps are nba timestamps', (done) => {
				this.timeout(5000)
				validNbaPbpTimestamp()
				//by default, 20001.6 is a reg timestamp, so that should be the only updated timestamps
				expect(fakeTimestampData.find(ts => ts.nba_timestamp_id === '20001.6').start_time).to.equal(-1)

				automated_tasks._updateTodayGamePlaysWithTimestamp((fakeBaton) => {
					expect(fakeBaton.additionalData.updated_nba_timestamps).to.deep.equal(['20001.6'])
					expect(fakeTimestampData.find(ts => ts.nba_timestamp_id === '20001.6').start_time > -1).to.equal(true)
					done()
				})

			})

		})

		describe('nba players', () => {

			var validNbaPlayers = () => {
				nock(nbaFetching.NBA_PLAYERS_URL).get(/.*/).reply(200, fakeNbaPlayerData)
			}

			var invalidNBAPlayers = (err) => {
				nock(nbaFetching.NBA_PLAYERS_URL).get(/.*/).reply(500, err)
			}

			beforeEach(function() {

				sandbox.stub(dbActions, 'getAllCharacterData').callsFake(function(baton, queryParams, callback) {
					var result = [...fakeCharacterData]
					if (queryParams.character_name) {
						result = result.filter((character) => {
							return queryParams.character_name.includes(character.character_name)
						})
					}
					if (queryParams.character_id) {
						result = result.filter((character) => {
							return queryParams.character_id.includes(character.character_id)
						})
					}
					if (queryParams.nba_player_id) {
						result = result.filter((character) => {
							return queryParams.nba_player_id.includes(character.nba_player_id)
						})
					}
					callback(result)
				})

				sandbox.stub(dbActions, 'insertCharacter').callsFake(function(baton, character, callback) {
					if (Array.isArray(character)) fakeCharacterData = fakeCharacterData.concat(character)
					else fakeCharacterData.push(character)
					callback(character)
				})
			})

			it('should fetch and insert new nba players as characters', (done) => {
				var char_1 = 10002 //nba player ids to be added
				var char_2 = 10003
				validNbaPlayers()
				automated_tasks._updateActivePlayers()
				setTimeout(() => {
					expect(fakeCharacterData).to.deep.contains({
						character_id: 10,
						character_name: 'Intest nba player 2',
						nba_player_id: char_1
					})
					expect(fakeCharacterData).to.deep.contains({
						character_id: 10,
						character_name: 'Intest nba player 3',
						nba_player_id: char_2
					})
					expect(fakeBaton.additionalData).to.deep.equal({
						nba_player_ids_added: [char_1, char_2]
					})
					done()
				}, 50)
			})

			it('should not add any when all players are already added', (done) => {
				fakeCharacterData[0].nba_player_id = 10002
				fakeCharacterData[1].nba_player_id = 10003
				validNbaPlayers()
				automated_tasks._updateActivePlayers()
				setTimeout(() => {
					expect(fakeBaton.additionalData).to.deep.equal({
						none_to_add: true
					})
					done()
				}, 50)
			})

			it('should finish flow when invalid req to nba server for players', (done) => {
				var err = {
					err: 'InTest Error'
				}
				invalidNBAPlayers(err)
				automated_tasks._updateActivePlayers()
				setTimeout(() => {
					expect(fakeBaton.additionalData.no_players_to_add).to.equal(true)
					done()
				}, 50)
			})
		})

		describe('nba games', () => {

			var universalEpochTime = 1000000000;

			var validNBAGameSchedule = () => {
				nock(nbaFetching.getNbaGamesForMonthUrl()).get(/.*/).reply(200, fakeNbaGameScheduleData)
			}

			var invalidNBAGameSchedule = (err) => {
				nock(nbaFetching.getNbaGamesForMonthUrl()).get(/.*/).reply(500, err)
			}

			beforeEach(() => {
				sandbox.stub(actions, 'convertUtcToEpoch').callsFake(() => {
					return universalEpochTime
				})

				//stub get all series data for all tests
				sandbox.stub(dbActions, 'getAllEpisodeData').callsFake(function(baton, queryData, callback) {
					var result = [...fakeEpisodeData].filter(ep => {
						return (queryData.series_id && queryData.series_id.length > 0 ? queryData.series_id.includes(ep.series_id) : true)
					}).filter(ep => {
						return (queryData.youtube_id && queryData.youtube_id.length > 0 ? queryData.youtube_id.includes(ep.youtube_id) : true)
					}).filter(ep => {
						return (queryData.episode_id && queryData.episode_id.length > 0 ? queryData.episode_id.includes(ep.episode_id) : true)
					}).filter(ep => {
						return (queryData.nba_game_id && queryData.nba_game_id.length > 0 ? queryData.nba_game_id.includes(ep.nba_game_id) : true)
					})
					callback(result)
				})

				sandbox.stub(dbActions, 'insertEpisode').callsFake(function(baton, episode, callback) {
					if (Array.isArray(episode)) fakeEpisodeData = fakeEpisodeData.concat(episode)
					else fakeEpisodeData.push(episode)
					callback(episode)
				})
			})

			it('should fetch and insert new episodes', (done) => {
				var gid_1 = '10002' //game ids of games to be added
				var gid_2 = '10003'
				validNBAGameSchedule()
				automated_tasks._updateActiveNBAGames()
				setTimeout(() => {
					expect(fakeEpisodeData).to.deep.contains({
						nba_game_id: gid_1,
						episode_name: 'HOULAK2019-10-05',
						nba_start_time: universalEpochTime,
						episode_id: 10
					})
					expect(fakeEpisodeData).to.deep.contains({
						nba_game_id: gid_2,
						episode_name: 'CELLAK2019-12-10',
						nba_start_time: universalEpochTime,
						episode_id: 10
					})
					expect(fakeBaton.additionalData).to.deep.equal({
						nba_game_ids_added: [gid_1, gid_2]
					})
					done()
				}, 50)
			})

			it('should not add any when all games are already added', (done) => {
				fakeNbaGameScheduleData.mscd.g = [fakeNbaGameScheduleData.mscd.g[0]] //the first game is already added  
				validNBAGameSchedule()
				automated_tasks._updateActiveNBAGames()
				setTimeout(() => {
					expect(fakeBaton.additionalData).to.deep.equal({
						none_to_add: true
					})
					done()
				}, 50)
			})

			it('should finish flow when invalid req to nba server for game schedule', (done) => {
				var err = {
					err: 'InTest Error'
				}
				invalidNBAGameSchedule(err)
				automated_tasks._updateActiveNBAGames()
				setTimeout(() => {
					expect(fakeBaton.additionalData.no_games_to_add).to.equal(true)
					done()
				}, 50)
			})
		})

	})


	describe('user', function() {

		var fakeBaton;

		var hashedPassword = 'hashedPassword'


		function sucsPassCompare() {
			sandbox.stub(bcrypt, 'compare').callsFake(function(pass, saved, callback) {
				callback(null, true)
			})
		}

		function failPassCompare() {
			sandbox.stub(bcrypt, 'compare').callsFake(function(pass, saved, callback) {
				callback(null, false)
			})
		}

		function authVerify() {
			sandbox.stub(jwt, 'verify').callsFake(function(token, key, callback) {
				callback(null, token)
			})
		}

		function authVerifyFail() {
			sandbox.stub(jwt, 'verify').callsFake(function(token, key, callback) {
				callback(null, undefined)
			})
		}


		beforeEach(function() {

			auth.authValidate.restore()

			//stub get all series dat for all tests
			sandbox.stub(dbActions, 'getUserData').callsFake(function(baton, data, callback) {
				return callback(fakeUserData.filter(user => {
					return user.username == data.username || user.email == data.email
				}))
			})

			sandbox.stub(bcrypt, 'hash').callsFake(function(pass, salt, callback) {
				callback(null, hashedPassword)
			})

			sandbox.stub(dbActions, 'insertUser').callsFake(function(baton, newUser, callback) {
				fakeUserData.push(newUser)
				callback(fakeUserData)
			})

			sandbox.stub(jwt, 'sign').callsFake(function(payload, privateKey, signingOptions) {
				return {
					payload: payload,
					privateKey: privateKey,
					signingOptions: signingOptions
				}
			})

		})

		describe('create user', function() {

			it('should create user', function(done) {
				var headers = {
					username: 'testUserName',
					email: 'testemail@email.com',
					password: 'testPassword1'
				}
				sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					headers.password = hashedPassword
					headers.user_id = 10
					expect(fakeUserData[fakeUserData.length - 1]).to.deep.equal(headers)
					done()
				})
			})

			it('should throw parameter validation for missing params', function(done) {
				var headers = {
					//missing username
					email: 'testemail@email.com',
					password: 'testPassword1'
				}
				sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			it('should throw for invalid email format', function(done) {
				var headers = {
					username: 'testUserName',
					email: 'testemail', //invalid email format
					password: 'testPassword1'
				}
				sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Email Format')
					done()
				})
			})

			it('should throw for invalid password validation', function(done) {
				var headers = {
					username: 'testUserName',
					email: 'testemail@email.com',
					password: 'pass' //invalid password 
				}
				sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Password,Please fuitfil requirements')
					done()
				})
			})

			it('should throw for existing account with email', function(done) {
				var headers = {
					username: 'testUserName',
					email: fakeUserData[0].email, //existing email
					password: 'testPassword1'
				}
				sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Email Already Registered')
					done()
				})
			})

		})

		describe('login', function() {

			it('should login user with username', function(done) {
				var user = fakeUserData[0]
				var headers = {
					username: user.username,
					password: user.password
				}
				sucsPassCompare();
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.auth_token.payload).to.deep.equal({
						user_id: user.user_id
					})
					done()
				})
			})


			it('should login user with email', function(done) {
				var user = fakeUserData[0]
				var headers = {
					email: user.email,
					password: user.password
				}
				sucsPassCompare();
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.auth_token.payload).to.deep.equal({
						user_id: user.user_id
					})
					done()
				})
			})

			it('should login user and set user role', function(done) {
				fakeUserData[0].role = 101
				var user = fakeUserData[0]
				var headers = {
					email: user.email,
					password: user.password
				}
				sucsPassCompare();
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.auth_token.payload).to.deep.equal({
						user_id: user.user_id,
						user_role: user.role
					})
					done()
				})
			})

			it('should throw for invalid username', function(done) {
				var user = fakeUserData[0]
				var headers = {
					username: 'invalidUsername',
					password: user.password
				}
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Username')
					done()
				})
			})

			it('should throw for invalid email format', function(done) {
				var user = fakeUserData[0]
				var headers = {
					email: 'invalidEmail',
					password: user.password
				}
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Email Format')
					done()
				})
			})

			it('should throw for invalid email format', function(done) {
				var user = fakeUserData[0]
				var headers = {
					email: 'invalidEmail@test.com',
					password: user.password
				}
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Email')
					done()
				})
			})

			it('should throw for invalid password', function(done) {
				var user = fakeUserData[0]
				var headers = {
					username: user.username,
					password: user.password
				}
				failPassCompare();
				sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Password')
					done()
				})
			})
		})

		describe('authenticate', function() {

			var createBatonForTest = () => {
				fakeBaton = actions._getBaton('authActionTest', fakeReq.body, fakeRes)
			}

			it('should validate auth token', function(done) {
				fakeReq.headers = {
					auth_token: {
						user_id: 101
					},
					test_mode: true
				}
				authVerify();
				createBatonForTest();
				auth.authValidate(fakeBaton, fakeReq, function() {
					expect(fakeBaton.user_id).to.equal(101)
					done()
				})
			})

			it('should not validate with no test mode', function(done) {
				fakeReq.headers = {
					auth_token: {
						user_id: 101
					},
					//test_mode:true
				}
				authVerify();
				createBatonForTest();
				auth.authValidate(fakeBaton, fakeReq, function() {
					expect(fakeBaton.user_id).to.equal(null)
					done()
				})
			})

			it('should throw for invalid auth token', (done) => {

				fakeReq.headers = {
					auth_token: 'test',
					test_mode: true
				}
				authVerifyFail();
				createBatonForTest();
				auth.authValidate(fakeBaton, fakeReq, () => {})
				setTimeout(() => {
					expect(fakeBaton.err[0].public_message).to.equal('Auth token invalid')
					expect(fakeRes.endStatus).to.equal(401);
					done()
				}, TIMEOUT)
			})
		})

		describe('validate endpoint', function() {

			it('should validate user for endpoint', (done) => {

				var headers = {
					auth_token: {
						user_id: 101
					},
					test_mode: true
				}
				authVerify();

				sendRequest('validate', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					done()
				})
			})

			it('should throw error for invalid jwt', (done) => {

				var headers = {
					auth_token: {
						user_id: 101
					},
					test_mode: true
				}
				authVerifyFail();

				sendRequest('validate', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertErrorMessage(res, 'Auth token invalid', /*custom=*/ false, 401)
					done()
				})
			})

		})

		describe('actions and roles', function() {

			var action_stub;

			var fakeRoleData = [{
				role_id: 0,
				role_name: 'Admin',
			}, {
				role_id: 1,
				role_name: 'Other',

			}]

			var fakeActionData = [{
				action_id: 101,
				action_name: 'getTimestampData'
			}, {
				action_id: 102,
				action_name: 'getEpisodeData'
			}]

			var fakeRoleActionData = [{
				role_id: 0,
				action_id: 101
			}, {
				role_id: 0,
				action_id: 102
			}, {
				role_id: 1,
				action_id: 101
			}]

			function setupUserWithRole(user, role_id) {
				user.role = role_id
			}

			var createBatonForTest = (method) => {
				fakeBaton = actions._getBaton(method, fakeReq.body, fakeRes)
			}

			beforeEach(function() {
				auth._validateRole.restore()

				sandbox.stub(dbActions, 'getAllRoleData').callsFake(function(baton, queryData, callback) {
					callback(fakeRoleData)
				})

				sandbox.stub(dbActions, 'getAllActionData').callsFake(function(baton, queryData, callback) {
					callback(fakeActionData)
				})

				sandbox.stub(dbActions, 'getAllRoleActionData').callsFake(function(baton, queryData, callback) {
					callback(fakeRoleActionData)
				})

				authVerify();
			})

			it('should validate user with permission', (done) => {
				var user = fakeUserData[0]
				setupUserWithRole(user, 0)
				fakeReq.headers = {
					auth_token: {
						user_id: 101,
						user_role: 0
					},
					test_mode: true
				}
				createBatonForTest('getTimestampData');
				auth.authValidate(fakeBaton, fakeReq, function() {
					//means the authentication was sucsessful
					done()
				})
			})

			it('should not validate user with unsufficient action', (done) => {
				var user = fakeUserData[0]
				setupUserWithRole(user, 1) //1 is not admin, doesn't have 'getEpisodeData' action 
				fakeReq.headers = {
					auth_token: {
						user_id: 101,
						user_role: 1
					},
					test_mode: true
				}
				createBatonForTest('getEpisodeData');
				auth.authValidate(fakeBaton, fakeReq, () => {})
				setTimeout(() => {
					expect(fakeBaton.err[0].public_message).to.equal('Permission Denied')
					done()
				}, TIMEOUT)
			})

			it('should not validate user with invalid role_id', (done) => {
				var user = fakeUserData[0]
				setupUserWithRole(user, 1) //1 is not admin, doesn't have 'getEpisodeData' action 
				fakeReq.headers = {
					auth_token: {
						user_id: 101,
						//role_id is missing
					},
					test_mode: true
				}
				createBatonForTest('getEpisodeData');
				auth.authValidate(fakeBaton, fakeReq, () => {})
				setTimeout(() => {
					expect(fakeBaton.err[0].public_message).to.equal('Permission Denied')
					done()
				}, TIMEOUT)
			})

		})

	})

	describe('request validation', function() {

		var fakeBaton;

		beforeEach(() => {
			actions.setActionValidation({
				testAction: {
					attr_1: {
						type: "number"
					},
					attr_2: {
						type: "boolean",
						optional: true
					},
					attr_3: {
						type: "number",
						multiple: true
					},
					attr_4: {
						type: "intest_custom_obj_1",
						optional: true
					},
					attr_5: {
						type: "intest_custom_obj_2",
						optional: true
					}
				}
			})

			endpointRequestParams.setCustomObjects({
				intest_custom_obj_1: {
					custom_obj_attr_1: 'number',
				},
				intest_custom_obj_2: {
					custom_obj_attr_2: 'array'
				}
			})
		})

		afterEach(() => {
			actions.resetActionValidation()
			endpointRequestParams.resetCustomObjects();
		})

		function createFakeBaton(params, post) {
			var baton = actions._getBaton('testAction', params, fakeRes)
			if (post) baton.requestType = 'POST'
			return baton
		}

		it('should validate request params', function(done) {
			var params = {
				attr_1: "101",
				attr_3: "101, 102"
			}
			actions.validateRequest(createFakeBaton(params), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				done()
			})
		})

		it('should vaildate request params for post request', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102]
			}
			actions.validateRequest(createFakeBaton(params, /*post=*/ true), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				done()
			})
		})

		it('should vaildate request params for post request with custom obj', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_4: {
					custom_obj_attr_1: 1
				}
			}
			actions.validateRequest(createFakeBaton(params, /*post=*/ true), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				expect(updated_params.attr_4).to.deep.equal({
					custom_obj_attr_1: 1
				})
				done()
			})
		})

		it('should vaildate request params for post request with custom obj with array', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_5: {
					custom_obj_attr_2: [1, 2, 3]
				}
			}
			actions.validateRequest(createFakeBaton(params, /*post=*/ true), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				expect(updated_params.attr_5).to.deep.equal({
					custom_obj_attr_2: [1, 2, 3]
				})
				done()
			})
		})

		it('should throw non optional error', (done) => {
			var params = {
				attr_2: 'true',
				attr_3: "101, 102"
			}
			var fakeBaton = createFakeBaton(params)
			actions.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Attibute value missing')
				done()
			}, TIMEOUT)
		})

		it('should throw non multiple error', (done) => {
			var params = {
				attr_1: "101, 102",
				attr_3: "101,102"
			}
			var fakeBaton = createFakeBaton(params)
			actions.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Single Value is Expected')
				done()
			}, TIMEOUT)
		})

		it('should throw invalid attribute type', (done) => {
			var params = {
				attr_1: "101",
				attr_2: '101',
				attr_3: "101,102"
			}
			var fakeBaton = createFakeBaton(params)
			actions.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

		it('should throw invalid attribute type for post request', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 'a102'] //102 invalid type
			}
			var fakeBaton = createFakeBaton(params, /*post=*/ true)
			actions.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

		it('should throw invalid attribute type for post request custom object', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_5: {
					custom_obj_attr_2: 101 //invalid, expecting an array 
				}
			}
			var fakeBaton = createFakeBaton(params, /*post=*/ true)
			actions.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

		it('should throw for invalid value in post req custom object array', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_5: {
					custom_obj_attr_2: [1, 2, 'a'] //invalid a 
				}
			}
			var fakeBaton = createFakeBaton(params, /*post=*/ true)
			actions.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

	})

	describe('series', function() {

		beforeEach(function() {
			//stub get all series dat for all tests
			sandbox.stub(dbActions, 'getAllSeriesData').callsFake(function(baton, callback) {
				return callback(fakeSeriesData)
			})
		})

		it('should return all series data', function(done) {
			sendRequest('getSeriesData', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal(fakeSeriesData)
				done()
			})

		})

		it('should create new series', function(done) {


			sandbox.stub(dbActions, 'insertSeries').callsFake(function(baton, newSeries, callback) {
				fakeSeriesData.push(newSeries)
				return callback(fakeSeriesData)
			})

			var series_name = 'InTest Series'
			var params = {
				series_name: series_name
			}

			sendRequest('newSeries', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).equal(3)
				expect(res.body[2]).to.deep.equal({
					series_id: 10,
					series_name: series_name
				})
				done()
			})
		})

		it('should throw error when same series data', function(done) {
			var series_name = 'InTest Series'
			fakeSeriesData[0].series_name = series_name

			var params = {
				series_name: series_name
			}

			sendRequest('newSeries', params).end((err, res, body) => {
				assertErrorMessage(res, 'Series Name exists')
				done()
			})
		})
	})

	describe('episode', function() {

		beforeEach(function() {

			//stub get all series dat for all tests
			sandbox.stub(dbActions, 'getAllEpisodeData').callsFake(function(baton, queryData, callback) {
				var result = [...fakeEpisodeData].filter(ep => {
					return (queryData.series_id && queryData.series_id.length > 0 ? queryData.series_id.includes(ep.series_id) : true)
				}).filter(ep => {
					return (queryData.youtube_id && queryData.youtube_id.length > 0 ? queryData.youtube_id.includes(ep.youtube_id) : true)
				}).filter(ep => {
					return (queryData.episode_id && queryData.episode_id.length > 0 ? queryData.episode_id.includes(ep.episode_id) : true)
				}).filter(ep => {
					return (queryData.nba_game_id && queryData.nba_game_id.length > 0 ? queryData.nba_game_id.includes(ep.nba_game_id) : true)
				}).filter(ep => {
					return (queryData.lessThan ? ep.nba_start_time < queryData.lessThan.nba_start_time : true)
				}).filter(ep => {
					return (queryData.greaterThan ? ep.nba_start_time > queryData.greaterThan.nba_start_time : true)
				})
				return callback(result)
			})
		})


		it('should return all episode data', function(done) {
			sendRequest('getEpisodeData', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal(fakeEpisodeData)
				done()
			})
		})

		it('should filter by one series id', function(done) {
			var params = {
				series_ids: '0'
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).equal(fakeEpisodeData.filter(ep => {
					return ep.series_id == 0
				}).length)
				done()
			})
		})

		it('should filter by multiple series id', function(done) {
			var params = {
				series_ids: '0,1'
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).equal(fakeEpisodeData.filter(ep => {
					return ep.series_id == 0 || ep.series_id == 1
				}).length)
				done()
			})
		})

		it('should filter by before nba start time', function(done) {
			var params = {
				nbaBeforeEpochTime: 15
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).equal(fakeEpisodeData.filter(ep => {
					return ep.nba_start_time < 15
				}).length)
				done()
			})
		})

		it('should filter by before after start time', function(done) {
			var params = {
				nbaAfterEpochTime: 9
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).equal(fakeEpisodeData.filter(ep => {
					return ep.nba_start_time > 9
				}).length)
				done()
			})
		})

		it('should filter by youtube id', function(done) {
			var params = {
				youtube_link: 'https://www.youtube.com/watch?v=' + fakeEpisodeData[3].youtube_id
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body[0]).to.deep.equal(fakeEpisodeData[3])
				done()
			})
		})

		it('should filter by nba game id', function(done) {
			var params = {
				nba_game_ids: fakeEpisodeData[4].nba_game_id
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body[0]).to.deep.equal(fakeEpisodeData[4])
				done()
			})
		})

		it('should throw error for invalid youtube ', function(done) {
			var params = {
				youtube_link: 'https://www.youtube.com/wat?v=' + fakeEpisodeData[3].youtube_id
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertErrorMessage(res, 'Invalid Youtube Link')
				done()
			})
		})

		it('should throw error for invalid series_ids param', function(done) {

			var params = {
				series_ids: 'text'
			}

			sendRequest('getEpisodeData', params).end((err, res, body) => {
				assertErrorMessage(res, 'Parameter validation error')
				done()
			})
		})

		describe('update episode', () => {

			beforeEach(() => {
				//stub get all series dat for all tests
				sandbox.stub(dbActions, 'updateEpisode').callsFake(function(baton, values, conditions, callback) {
					var attr = Object.keys(conditions)[0]
					fakeEpisodeData = fakeEpisodeData.map(ep => {
						if (ep[attr] === conditions[attr]) {
							Object.keys(values).forEach(val_attr => {
								ep[val_attr] = values[val_attr]
							})
						}
						return ep
					})
					callback(fakeEpisodeData.filter(ep => ep[attr] === conditions[attr])[0])
				})
			})


			it('should update offset of episode', (done) => {
				var params = {
					video_offset: 10,
					episode_id: 5 // this ep has nba game id
				}

				sendRequest('updateEpisode', params, /*post=*/ true).end((err, res, body) => {
					assertSuccess(res, /*post=*/ true)
					expect(fakeEpisodeData).to.deep.contains({
						"episode_id": 5,
						"episode_name": "Test Episode 5",
						"nba_start_time": '7:00:00',
						"nba_game_id": '10001',
						"video_offset": 10
					})
					done()
				})
			})


			it('should throw for invalid episdoe without game id', (done) => {
				var params = {
					video_offset: 10,
					episode_id: 4 // this ep has no game id
				}

				sendRequest('updateEpisode', params, /*post=*/ true).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Episode Id')
					done()
				})
			})

		})

		describe('inserting new episode', function() {

			var universalNbaStartTime = "2000-01-01 01:01:01 UTC"
			var universalResultingEpochTime = 946688461000

			function createUrl() {
				return cred.VIDEO_SERVER_URL + ':' + cred.VIDEO_SERVER_PORT
			}

			function createPath(params) {
				return '/downloadYoutubeVideo?youtube_link=' + params.youtube_link + '&episode_id=' + 10
			}

			function setupSucsessYoutubeDownload(params) {
				nock(createUrl()).get(createPath(params)).reply(200, {})
			}

			function setupErrorYoutubeDownlod(error, params) {
				nock(createUrl()).get(createPath(params)).reply(500, error)
			}

			function setupTimeoutYoutubeDownload(params) {
				nock(createUrl()).get(createPath(params)).socketDelay(1000).reply(200, {})
			}

			beforeEach(function() {


				sandbox.stub(dbActions, 'getAllSeriesData').callsFake(function(baton, callback) {
					return callback(fakeSeriesData)
				})

				sandbox.stub(dbActions, 'insertEpisode').callsFake(function(baton, episode, callback) {
					fakeEpisodeData.push(episode)
					return callback(episode)
				})

			})

			it('should create new episode', function(done) {
				var episode_data = {
					episode_name: "InTest Episode"
				}

				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						episode_name: episode_data.episode_name,
						episode_id: 10
					})
					done()
				})

			})

			it('should create new episode with optional series_id', function(done) {
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0'
				}

				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						episode_name: episode_data.episode_name,
						episode_id: 10,
						series_id: 0
					})
					done()
				})
			})

			it('should create new episode with optional youtube link', function(done) {
				var testYoutubeId = 'hIahFRFd5po'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId
				}

				setupSucsessYoutubeDownload(episode_data)

				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						episode_name: episode_data.episode_name,
						episode_id: 10,
						series_id: 0,
						youtube_id: testYoutubeId,
						youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId,
						downloadResponse: 'Youtube video download in queue'
					})
					done()
				})
			})

			it('should create new episode with optional youtube link, show error in download response', function(done) {
				var testYoutubeId = 'hIahFRFd5po'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId
				}

				var error = {
					error: 'InTest error'
				}
				setupErrorYoutubeDownlod(error, episode_data)

				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						episode_name: episode_data.episode_name,
						episode_id: 10,
						series_id: 0,
						youtube_id: testYoutubeId,
						youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId,
						downloadResponse: error
					})
					done()
				})
			})

			it('should throw for invalid youtube link', function(done) {
				var testYoutubeId = 'jkPkbEqS-Ps'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					youtube_link: 'https://www.youtube.com/=' + testYoutubeId //invalid youtube url
				}

				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Youtube Link')
					done()
				})
			})

			it('should create new episode with optional youtube link, show timeout in download response', function(done) {
				var testYoutubeId = 'jkPkbEqS-Ps'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId
				}

				setupTimeoutYoutubeDownload(episode_data)

				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						episode_name: episode_data.episode_name,
						episode_id: 10,
						series_id: 0,
						youtube_id: testYoutubeId,
						youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId,
						downloadResponse: {
							error: 'Timeout while making download youtube call to video server'
						}
					})
					done()
				})
			})

			it('should create new episode with optional nba game id', function(done) {
				var nbaGameId = '60600'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					nba_game_id: nbaGameId,
					nba_start_time: universalNbaStartTime
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						episode_name: episode_data.episode_name,
						episode_id: 10,
						series_id: 0,
						nba_game_id: nbaGameId,
						nba_start_time: universalResultingEpochTime
					})
					expect(fakeEpisodeData).to.deep.contains({
						episode_name: 'InTest Episode',
						series_id: 0,
						nba_game_id: nbaGameId,
						episode_id: 10,
						nba_start_time: universalResultingEpochTime
					});
					done()
				})
			})

			it('should throw for already registered nba game id', function(done) {
				var testNbaGameId = fakeEpisodeData[4].nba_game_id //existing nba game id
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					nba_game_id: testNbaGameId,
					nba_start_time: universalNbaStartTime
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'NBA Game Id already Registered')
					done()
				})
			})

			it('should throw for missing nba start time if nba game id is present', function(done) {
				var nbaGameId = '60600'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					nba_game_id: nbaGameId,
					//nba_start_time: universalNbaStarttime 
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'NBA Start Time is invalid')
					done()
				})
			})

			it('should throw for invalid nba start time', function(done) {
				var nbaGameId = '60600'
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					nba_game_id: nbaGameId,
					nba_start_time: '2000 01 01 01:01:01 UTC' //invalid utc format
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'NBA Start Time is invalid')
					done()
				})
			})

			it('should throw for already registered youtube id', function(done) {
				var testYoutubeId = fakeEpisodeData[3].youtube_id //existing youtube id
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'Youtube Id already Registered')
					done()
				})
			})

			it('should throw for already registered youtube id', function(done) {
				var testYoutubeId = fakeEpisodeData[3].youtube_id //existing youtube id
				var episode_data = {
					episode_name: "InTest Episode",
					series_id: '0',
					youtube_link: 'https://www.youtube.com/watch?v=' + testYoutubeId
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'Youtube Id already Registered')
					done()
				})
			})


			it('should throw error for requiring episode_name', function(done) {

				sendRequest('newEpisode', {}).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			it('should create throw error for invalid series', function(done) {
				var episode_data = {
					series_id: "3", //not valid series in fakeSeriesData
					episode_name: "InTest Episode"
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Series Id')
					done()
				})
			})

			it('should create throw error for existing episode name', function(done) {
				var episode_data = {
					episode_name: fakeEpisodeData[0].episode_name
				}
				sendRequest('newEpisode', episode_data).end((err, res, body) => {
					assertErrorMessage(res, 'Episode Name exists')
					done()
				})

			})
		});
	});

	describe('character ', function() {

		beforeEach(function() {
			//stub get all series dat for all tests
			sandbox.stub(dbActions, 'getAllCharacterData').callsFake(function(baton, queryParams, callback) {
				var result = [...fakeCharacterData]
				if (queryParams.character_name) {
					result = result.filter((character) => {
						return queryParams.character_name.includes(character.character_name)
					})
				}
				if (queryParams.character_id) {
					result = result.filter((character) => {
						return queryParams.character_id.includes(character.character_id)
					})
				}
				callback(result)
			})
		})


		it('should return all character data', function(done) {
			sendRequest('getCharacterData', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal(fakeCharacterData)
				done()
			})
		})

		it('should filter by character name ', (done) => {

			var values = {
				character_name: fakeCharacterData[0].character_name
			}

			sendRequest('getCharacterData', values).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal([fakeCharacterData[0]])
				done()
			})
		})


		describe('inserting new character', function() {

			beforeEach(function() {


				sandbox.stub(dbActions, 'getAllSeriesData').callsFake(function(baton, callback) {
					return callback(fakeSeriesData)
				})

				sandbox.stub(dbActions, 'insertCharacter').callsFake(function(baton, values, callback) {
					fakeEpisodeData.push(values)
					return callback(values)
				})
			})

			it('should create new character', function(done) {
				var values = {
					character_name: "Mark",
				}
				sendRequest('newCharacter', values).end((err, res, body) => {
					assertSuccess(res)
					values.character_id = 10;
					expect(res.body).to.deep.equal(values)
					done()
				})
			})

			it('should throw error for requiring character_name', function(done) {
				sendRequest('newCharacter', {}).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})

			})

			it('should create throw error for existing character name ', function(done) {
				var values = {
					character_name: fakeCharacterData[0].character_name
				}
				sendRequest('newCharacter', values).end((err, res, body) => {
					assertErrorMessage(res, 'Character Name already exists')
					done()
				})
			})

		})

	});

	describe('category', function() {

		beforeEach(function() {
			//stub get all series dat for all tests
			sandbox.stub(dbActions, 'getAllCategoryData').callsFake(function(baton, queryParams, callback) {
				var result = [...fakeCategoryData]
				if (queryParams.category_name) {
					result = result.filter((category) => {
						return queryParams.category_name.includes(category.category_name)
					})
				}
				if (queryParams.category_id) {
					result = result.filter((category) => {
						return queryParams.category_id.includes(category.category_id)
					})
				}
				callback(result)
			})
		})


		it('should return all category data', function(done) {
			sendRequest('getCategoryData', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal(fakeCategoryData)
				done()
			})
		})

		it('should filter by category name', function(done) {
			var category_name = fakeCategoryData[0].category_name
			sendRequest('getCategoryData', {
				category_name: category_name
			}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal([fakeCategoryData[0]])
				done()
			})
		})

		describe('inserting new category', function() {

			beforeEach(function() {

				sandbox.stub(dbActions, 'insertCategory').callsFake(function(baton, values, callback) {
					fakeCategoryData.push(values)
					return callback(values)
				})
			})

			it('should create new categoy', function(done) {
				var category_values = {
					category_name: "InTest Category"
				}

				sendRequest('newCategory', category_values).end((err, res, body) => {
					assertSuccess(res)
					category_values.category_id = 10
					expect(res.body).to.deep.equal(category_values)
					done()
				})

			})

			it('should throw error for invalid params', function(done) {
				sendRequest('newCategory', {}).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})


			it('should create throw error for existing episode name in same series', function(done) {
				var category_values = {
					category_name: fakeCategoryData[0].category_name
				}
				sendRequest('newCategory', category_values).end((err, res, body) => {
					assertErrorMessage(res, 'Category Name exists')
					done()
				})
			})

		});
	});


	describe('timestamp', function() {
		var universal_timestamps;

		beforeEach(function() {

			universal_timestamps = [10, 20, 30, 40]

			actions._generateId.restore()
			sandbox.stub(actions, '_generateId').callsFake((len) => {
				return (len === 10 ? 10000 : universal_timestamps.shift())
			})

			//stub get all timestamp data for all tests
			sandbox.stub(dbActions, 'getAllTimestampData').callsFake(function(baton, data, callback) {
				var result = [...fakeTimestampData]
				if (data.episode_id && data.episode_id.length > 0) {
					result = result.filter(function(tm) {
						return data.episode_id.includes(tm.episode_id)
					})
				}
				if (data.timestamp_id && data.timestamp_id.length > 0) {
					result = result.filter(function(tm) {
						return data.timestamp_id.includes(tm.timestamp_id)
					})
				}
				callback(result)
			})

			//stub for the category/character for timestamp
			sandbox.stub(dbActions, 'getAllTimestampCategory').callsFake(function(baton, params, callback) {
				var result = [...fakeTimestampCategoryData]
				if (params.timestamp_ids && params.timestamp_ids > 0) {
					result = result.filter(function(tc) {
						return params.timestamp_ids.includes(tc.timestamp_id)
					});
				}
				return callback(result)
			})

			//stub for the category/character for timestamp
			sandbox.stub(dbActions, 'getAllTimestampCharacter').callsFake(function(baton, params, callback) {
				var result = [...fakeTimestampCharacterData]
				if (params.timestamp_id && params.timestamp_id > 0) {
					result = result.filter(function(tc) {
						return params.timestamp_id.includes(tc.timestamp_id)
					});
				}
				if (params.character_id && params.character_id > 0) {
					result = result.filter(function(tc) {
						return params.character_id.includes(tc.character_id)
					});
				}
				return callback(result)
			})
		})

		it('should return all timestamp data', function(done) {

			var fakeBaton;
			sandbox.stub(batonHandler, 'createBaton').callsFake(function(endpoint, params, res) {
				var baton = batonHandler.createBaton.wrappedMethod.apply(this, arguments)
				fakeBaton = baton;
				return baton
			})


			sendRequest('getTimestampData', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal(fakeTimestampData)
				expect(fakeBaton.db_limit['timestamp']).to.deep.equal({offset: 1, order_attr:'creation_time'})
				done()
			})
		})

		it('should have updated offset when passed', (done)=> {


			var fakeBaton;
			sandbox.stub(batonHandler, 'createBaton').callsFake(function(endpoint, params, res) {
				var baton = batonHandler.createBaton.wrappedMethod.apply(this, arguments)
				fakeBaton = baton;
				return baton
			})

			var queryParams = {
				offset : 2
			}

			sendRequest('getTimestampData', queryParams).end((err, res, body) => {
				assertSuccess(res)
				expect(fakeBaton.db_limit['timestamp']).to.deep.equal({offset: 2, order_attr:'creation_time'})
				done()
			})

		})

		it('should filter for episode id', function(done) {
			var params = {
				episode_ids: "1"
			}

			sendRequest('getTimestampData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).to.deep.equal(fakeTimestampData.filter(function(ts) {
					return ts.episode_id == 1
				}).length)
				done()
			})
		})

		it('should filter for character id', function(done) {

			var params = {
				character_ids: "1"
			}

			sendRequest('getTimestampData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.map(function(ts) {
					return ts.timestamp_id
				})).to.deep.equal(fakeTimestampCharacterData.map(function(ts) {
					return ts.timestamp_id
				}))
				done()
			})

		})

		it('should filter for category id', function(done) {
			var params = {
				category_ids: "0"
			}

			sendRequest('getTimestampData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.map(function(ts) {
					return ts.timestamp_id
				})).to.deep.equal(fakeTimestampCategoryData.map(function(ts) {
					return ts.timestamp_id
				}))
				done()
			})
		})

		it('should filter for character and category id', function(done) {

			var params = {
				character_ids: '1',
				category_ids: "0"
			}

			sendRequest('getTimestampData', params).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.map(function(ts) {
					return ts.timestamp_id
				})).to.deep.equal([4])
				done()
			})
		})

		it('should throw error for invalid episode id', function(done) {
			var params = {
				episode_ids: "text"
			}

			sendRequest('getTimestampData', params).end((err, res, body) => {
				assertErrorMessage(res, 'Parameter validation error')
				done()
			})
		})

		it('should throw error for invalid character id', function(done) {
			var params = {
				character_ids: "text"
			}

			sendRequest('getTimestampData', params).end((err, res, body) => {
				assertErrorMessage(res, 'Parameter validation error')
				done()
			})
		})

		describe('creating a new timestamp', function() {

			beforeEach(function() {

				//ensure character data matches series data
				sandbox.stub(dbActions, 'getAllCharacterData').callsFake(function(baton, queryParams, callback) {
					var result = [...fakeCharacterData]
					if (queryParams.character_name) {
						result = result.filter((character) => {
							return queryParams.character_name.includes(character.character_name)
						})
					}
					if (queryParams.character_id) {
						result = result.filter((character) => {
							return queryParams.character_id.includes(character.character_id)
						})
					}
					callback(result)
				})

				//stub get all series dat for all tests
				sandbox.stub(dbActions, 'getAllCategoryData').callsFake(function(baton, queryParams, callback) {
					var result = [...fakeCategoryData]
					if (queryParams.category_name) {
						result = result.filter((category) => {
							return queryParams.category_name.includes(category.category_name)
						})
					}
					if (queryParams.category_id) {
						result = result.filter((category) => {
							return queryParams.category_id.includes(category.category_id)
						})
					}
					callback(result)
				})

				//for ensureEpisodeIdExists
				sandbox.stub(dbActions, 'getAllEpisodeData').callsFake(function(baton, queryData, callback) {
					var result = [...fakeEpisodeData].filter(ep => {
						return (queryData.series_id && queryData.series_id.length > 0 ? queryData.series_id.includes(ep.series_id) : true)
					}).filter(ep => {
						return (queryData.youtube_id && queryData.youtube_id.length > 0 ? queryData.youtube_id.includes(ep.youtube_id) : true)
					}).filter(ep => {
						return (queryData.episode_id && queryData.episode_id.length > 0 ? queryData.episode_id.includes(ep.episode_id) : true)
					}).filter(ep => {
						return (queryData.nba_game_id && queryData.nba_game_id.length > 0 ? queryData.nba_game_id.includes(ep.nba_game_id) : true)
					})
					return callback(result)
				})

				sandbox.stub(dbActions, 'insertTimestampCharacter').callsFake(function(baton, values, callback) {
					fakeTimestampCharacterData = fakeTimestampCharacterData.filter(function(ts) {
						return !values.map(function(v) {
							return v[0]
						}).includes(ts.timestamp_id)
					})

					values.forEach(function(v) {
						fakeTimestampCharacterData.push(v)
					})
					callback(values)
				})

				sandbox.stub(dbActions, 'insertTimestampCategory').callsFake(function(baton, values, callback) {
					values.forEach(function(v) {
						fakeTimestampCategoryData.push(v)
					})
					callback(values)
				})


				sandbox.stub(dbActions, 'insertTimestamp').callsFake(function(baton, values, callback) {
					fakeTimestampData = fakeTimestampData.concat(values)
					callback(values)
				})
			})

			it('should create new timestamp', function(done) {
				var values = {
					start_time: "100",
					episode_id: "1"
				}

				sendRequest('newTimestamp', values).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body).to.deep.equal({
						start_time: 100,
						episode_id: 1,
						timestamp_id: 10
					})
					done()
				})
			})

			it('should throw error for invalid start time(type)', function(done) {
				var values = {
					start_time: "test",
					episode_id: "1"
				}
				sendRequest('newTimestamp', values).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			it('should throw error for invalid episode id (type)', function(done) {
				var values = {
					start_time: "100",
					episode_id: "text"
				}
				sendRequest('newTimestamp', values).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			it('should throw error for invalid episode id', function(done) {
				var values = {
					start_time: "100",
					episode_id: "100" //invalid episode id
				}
				sendRequest('newTimestamp', values).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Episode Id')
					done()
				})
			})

			describe('mass adding timestamps', function() {

				//for now all of the new timestamp will have the same timestamp id, since faking _generateId will only return one number

				it('should add multiple timestamps', function(done) {
					var values = {
						timestamps: [{
							start_time: 100,
							episode_id: 1,
							category_ids: [],
							character_ids: []
						}, {
							start_time: 200,
							episode_id: 1,
							category_ids: [],
							character_ids: []
						}]
					}
					var orig_timestamps = [...universal_timestamps]
					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertSuccess(res, /*post=*/ true)
						values.timestamps = values.timestamps.map(ts => {
							ts.timestamp_id = orig_timestamps.shift();
							return ts
						})
						expect(res.body.timestamps).to.deep.equal(values.timestamps)
						done()
					})
				})

				it('should add multiple timestamps with category and character ids ', function(done) {
					var values = {
						timestamps: [{
							start_time: 100,
							episode_id: 1,
							category_ids: [0],
							character_ids: [2, 4]
						}, {
							start_time: 200,
							episode_id: 1,
							category_ids: [2],
							character_ids: [1, 3]
						}]
					}
					var orig_timestamps = [...universal_timestamps]
					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertSuccess(res, /*post=*/ true)
						values.timestamps = values.timestamps.map(ts => {
							ts.timestamp_id = orig_timestamps.shift();
							return ts
						})
						expect(res.body.timestamps).to.deep.equal(values.timestamps)
						expect(fakeTimestampCharacterData).to.deep.contains({
							timestamp_id: 10,
							character_id: 2
						});
						expect(fakeTimestampCharacterData).to.deep.contains({
							timestamp_id: 10,
							character_id: 4
						});
						expect(fakeTimestampCategoryData).to.deep.contains({
							timestamp_id: 10,
							category_id: 0
						});
						expect(fakeTimestampCharacterData).to.deep.contains({
							timestamp_id: 20,
							character_id: 3
						});
						expect(fakeTimestampCharacterData).to.deep.contains({
							timestamp_id: 20,
							character_id: 1
						});
						expect(fakeTimestampCategoryData).to.deep.contains({
							timestamp_id: 20,
							category_id: 2
						});
						done()
					})
				})

				it('should get validation error for missing attr for one timestamp', function(done) {
					var values = {
						timestamps: [{
							start_time: 200,
							episode_id: 1,
							category_ids: [],
							character_ids: []
						}, {
							start_time: 100,
							//episode_id: 1 missing,
							category_ids: [],
							character_ids: []
						}]
					}

					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertErrorMessage(res, 'Parameter validation error')
						done()
					})
				})

				//same as the test above 
				it('should get validation error for (another) missing attr for one timestamp', function(done) {
					var values = {
						timestamps: [{
							start_time: 200,
							episode_id: 1,
							//category_ids:[], missing
							character_ids: []
						}, {
							start_time: 100,
							//episode_id: 1 missing,
							category_ids: [],
							character_ids: []
						}]
					}

					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertErrorMessage(res, 'Parameter validation error')
						done()
					})
				})


				it('should get validation error for invalid attr for one timestamp', function(done) {
					var values = {
						timestamps: [{
							start_time: 200,
							episode_id: 1,
							category_ids: [],
							character_ids: []
						}, {
							start_time: 100,
							episode_id: '1',
							category_ids: [],
							character_ids: []
						}]
					}

					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertErrorMessage(res, 'Parameter validation error')
						done()
					})
				})

				it('should get validation error for inlvalid episode id', function(done) {
					var values = {
						timestamps: [{
							start_time: 200,
							episode_id: 100, //invalid
							category_ids: [],
							character_ids: []
						}, {
							start_time: 100,
							episode_id: 1,
							category_ids: [],
							character_ids: []
						}]
					}

					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Episode Id')
						done()
					})
				})

				it('should get validation error for invalid character id', function(done) {
					var values = {
						timestamps: [{
							start_time: 100,
							episode_id: 1,
							category_ids: [0],
							character_ids: [2, 6] //6 is invalid
						}, {
							start_time: 200,
							episode_id: 1,
							category_ids: [2],
							character_ids: [1, 3]
						}]
					}
					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid characters')
						done()
					})
				})

				it('should get validation error for invalid category id', function(done) {
					var values = {
						timestamps: [{
							start_time: 100,
							episode_id: 1,
							category_ids: [0],
							character_ids: [2]
						}, {
							start_time: 200,
							episode_id: 1,
							category_ids: [2, 10], //10 is invalid
							character_ids: [1, 3]
						}]
					}
					sendRequest('massAddTimestamps', values, /*post=*/ true).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid categories')
						done()
					})
				})

			})

			describe('updating timestamp data', function() {

				beforeEach(function() {

					sandbox.stub(dbActions, 'removeTimestampCharacter').callsFake(function(baton, values, callback) {
						fakeTimestampCharacterData = fakeTimestampCharacterData.filter(function(ts) {
							return !values.map(function(v) {
								return v[0]
							}).includes(ts.timestamp_id)
						})
						callback(values)
					})


					sandbox.stub(dbActions, 'removeTimestampCategory').callsFake(function(baton, values, callback) {
						fakeTimestampCategoryData = fakeTimestampCategoryData.filter(function(ts) {
							return !values.map(function(v) {
								return v[0]
							}).includes(ts.timestamp_id)
						})
						callback(values)
					})

				})

				it('should update timestamp', function(done) {
					var values = {
						timestamp_id: "0",
						character_ids: "1,2",
						category_ids: "0,1"
					}

					sendRequest('updateTimestamp', values).end((err, res, body) => {
						assertSuccess(res)
						expect(res.body.character_ids).to.deep.equal([1, 2])
						expect(res.body.category_ids).to.deep.equal([0, 1])
						expect(fakeTimestampCharacterData[3]).to.deep.equal({
							timestamp_id: 0,
							character_id: 2
						});
						expect(fakeTimestampCategoryData[2]).to.deep.equal({
							timestamp_id: 0,
							category_id: 0
						});
						done()
					})
				})

				it('should throw error for invalid character', function(done) {
					var values = {
						timestamp_id: "0",
						character_ids: "10",
						category_ids: "0,1"
					}
					sendRequest('updateTimestamp', values).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid characters')
						done()
					})
				})

				it('should throw error for invalid category id', function(done) {
					var values = {
						timestamp_id: "0",
						character_ids: "1",
						category_ids: "5"
					}
					sendRequest('updateTimestamp', values).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid categories')
						done()
					})
				})


				it('should throw error for invalid timestamp id', function(done) {
					var values = {
						timestamp_id: "10",
						character_ids: "1",
						category_ids: "0,1"
					}
					sendRequest('updateTimestamp', values).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Timestamp Id')
						done()
					})
				})
			})

		})
	})

	describe('compilation', function() {

		beforeEach(function() {

			fakeTimestampData = [{
				"timestamp_id": 0,
				"start_time": 0,
				"episode_id": 2
			}, {
				"timestamp_id": 1,
				"start_time": 0,
				"episode_id": 1
			}, {
				"timestamp_id": 2,
				"start_time": 0,
				"episode_id": 2
			}, {
				"timestamp_id": 3,
				"start_time": 0,
				"episode_id": 3
			}];

			fakeEpisodeData = [{
				"episode_id": 1,
				"episode_name": "Test Episode 1",
				"air_date": 1564034876,
				"series_id": 0
			}, {
				"episode_id": 2,
				"episode_name": "Test Episode 2",
				"air_date": 1564038876,
				"youtube_id": 'ep2yturl'
			}, {
				"episode_id": 3,
				"episode_name": "Test Episode 3",
				"air_date": 1569038876,
				"youtube_id": 'ep3yturl'
			}];

			fakeCompilationData = [{
				"compilation_id": 101,
				"compilation_name": "InTest Compilation 1"
			}, {
				"compilation_id": 102,
				"compilation_name": "InTest Compilation 2"
			}, {
				"compilation_id": 103,
				"compilation_name": "InTest Compilation 3"
			}]

			fakeCompilationTimestampData = [{
				"compilation_id": 101,
				"timestamp_id": 0,
				"duration": 10,
				"start_time": 100
			}, {
				"compilation_id": 101,
				"timestamp_id": 1,
				"duration": 30,
				"start_time": 10
			}, {
				"compilation_id": 102,
				"timestamp_id": 2,
				"duration": 30,
				"start_time": 10
			}, {
				"compilation_id": 103,
				"timestamp_id": 0,
				"duration": 30,
				"start_time": 10
			}, {
				"compilation_id": 103,
				"timestamp_id": 2,
				"duration": 30,
				"start_time": 10
			}, {
				"compilation_id": 103,
				"timestamp_id": 3,
				"duration": 30,
				"start_time": 10
			}, ]

			//stub get all series dat for all tests
			sandbox.stub(dbActions, 'getAllEpisodeData').callsFake(function(baton, queryData, callback) {
				var result = [...fakeEpisodeData].filter(ep => {
					return (queryData.series_id && queryData.series_id.length > 0 ? queryData.series_id.includes(ep.series_id) : true)
				}).filter(ep => {
					return (queryData.youtube_id && queryData.youtube_id.length > 0 ? queryData.youtube_id.includes(ep.youtube_id) : true)
				}).filter(ep => {
					return (queryData.episode_id && queryData.episode_id.length > 0 ? queryData.episode_id.includes(ep.episode_id) : true)
				}).filter(ep => {
					return (queryData.nba_game_id && queryData.nba_game_id.length > 0 ? queryData.nba_game_id.includes(ep.nba_game_id) : true)
				})
				return callback(result)
			})

			//stub get all timestamp data for all tests
			sandbox.stub(dbActions, 'getAllTimestampData').callsFake(function(baton, data, callback) {
				var result = [...fakeTimestampData]
				if (data.episode_id && data.episode_id.length > 0) {
					result = result.filter(function(tm) {
						return data.episode_id.includes(tm.episode_id)
					})
				}
				if (data.timestamp_id && data.timestamp_id.length > 0) {
					result = result.filter(function(tm) {
						return data.timestamp_id.includes(tm.timestamp_id)
					})
				}
				callback(result)
			})

			//stub for the category/character for timestamp
			sandbox.stub(dbActions, 'getAllTimestampCategory').callsFake(function(baton, params, callback) {
				callback([])
			})

			//stub for the category/character for timestamp
			sandbox.stub(dbActions, 'getAllTimestampCharacter').callsFake(function(baton, params, callback) {
				callback([])
			})

			//stub get all compilation data for all tests
			sandbox.stub(dbActions, 'getAllCompilationData').callsFake(function(baton, data, callback) {
				var result = [...fakeCompilationData]
				if (data.compilation_id) {
					result = result.filter(function(ct) {
						return data.compilation_id.includes(ct.compilation_id)
					})
				}
				if (data.timestamp_id) {
					result = result.filter(function(ct) {
						return data.timestamp_id.includes(ct.timestamp_id)
					})
				}
				callback(result)
			})

			sandbox.stub(dbActions, 'insertCompilation').callsFake(function(baton, values, callback) {
				fakeCompilationData.push(values)
				callback(values)
			})

			//stub get all compilation timestamp data for all tests
			sandbox.stub(dbActions, 'getAllCompilationTimestamp').callsFake(function(baton, data, callback) {
				var result = [...fakeCompilationTimestampData]
				if (data.compilation_id) {
					result = result.filter(function(ct) {
						return data.compilation_id.includes(ct.compilation_id)
					})
				}
				if (data.timestamp_id) {
					result = result.filter(function(ct) {
						return data.timestamp_id.includes(ct.timestamp_id)
					})
				}
				callback(result)
			})

			sandbox.stub(dbActions, 'insertCompilationTimestamp').callsFake(function(baton, values, callback) {

				values.forEach(ct => {
					fakeCompilationTimestampData.push(ct)
				})
				callback(values)
			})

		})

		function updateCompilationDataWithTimestamp() {
			fakeCompilationData.forEach((cp) => {
				cp.timestamps = fakeCompilationTimestampData.filter((ct) => {
					return ct.compilation_id = cp.compilation_id
				}).forEach((ct) => {
					delete ct.compilation_id
				})
			})
		}

		function filterByTimestamp(timestamp_ids) {
			var filterCompilationIds = fakeCompilationTimestampData.filter(function(ct) {
				return timestamp_ids.includes(ct.timestamp_id)
			}).map((ct) => {
				return ct.compilation_id
			})
			return fakeCompilationData.filter((cp) => {
				return filterCompilationIds.includes(cp.compilation_id)
			})
		}

		it('should return all compilation data', function(done) {
			sendRequest('getCompilationData', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body).to.deep.equal(fakeCompilationData)
				done()
			})
		})

		it('should filter compilation data by timestamp id', function(done) {
			var values = {
				timestamp_ids: "1"
			}

			sendRequest('getCompilationData', values).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.map((cp) => {
					return cp.compilation_id
				})).to.deep.equal(fakeCompilationTimestampData.filter((ct) => {
					return ct.timestamp_id == 1
				}).map((ct) => {
					return ct.compilation_id
				}))
				expect(res.body[0].timestamps).to.deep.equal(fakeCompilationTimestampData.filter(ct => {
					return ct.compilation_id == res.body[0].compilation_id
				}))
				done()
			})
		})

		it('should filter compilation data by compilation id', function(done) {
			var values = {
				compilation_ids: "102"
			}
			sendRequest('getCompilationData', values).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.length).to.equal(1)
				expect(res.body.map((cp) => {
					return cp.compilation_id
				})).to.deep.equal([102])
				expect(res.body[0].timestamps).to.deep.equal(fakeCompilationTimestampData.filter(ct => {
					return ct.compilation_id == res.body[0].compilation_id
				}))
				done()
			})
		})

		describe('get compilation description', function() {

			var getLinkFromCompilationId = (compilation_id) => {
				var timestamps_ids = fakeCompilationTimestampData
					.filter(ct => ct.compilation_id === compilation_id)
					.map(ct => ct.timestamp_id)
				var episode_ids = fakeTimestampData.filter(ts => timestamps_ids.includes(ts.timestamp_id))
					.map(ts => ts.episode_id)
				return fakeEpisodeData.filter(ep => ep.youtube_id !== null)
					.filter(ep => episode_ids.includes(ep.episode_id))
					.map(ep => ep.episode_name + ":https://www.youtube.com/watch?v=" + ep.youtube_id)
			}

			it('should get compilation description, for multiple episode links, with two timestamps pointing to one episode', function(done) {
				var values = {
					compilation_id: "103"
				}
				sendRequest('getCompilationDescription', values).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.links).to.deep.equal(getLinkFromCompilationId(parseInt(values.compilation_id)))
					done()
				})
			})

			it('should get compilation description, one with link, one without', function(done) {
				var values = {
					compilation_id: "101"
				}
				sendRequest('getCompilationDescription', values).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.links).to.deep.equal(getLinkFromCompilationId(parseInt(values.compilation_id)))
					done()
				})
			})

		})


		describe('insert new compilation ', function() {

			it('should create new compilation', function(done) {
				var values = {
					compilation_name: "InTest Compilation",
					timestamps: [{
						timestamp_id: 1,
						duration: 10,
						start_time: 100
					}, {
						timestamp_id: 1,
						duration: 40,
						start_time: 400
					}]
				}

				sendRequest('newCompilation', values, /*post=*/ true).end((err, res, body) => {
					assertSuccess(res, /*post=*/ true)
					values.compilation_id = 10;
					expect(res.body).to.deep.equal(values)
					done()
				})

			})

			it('should throw for invalid timestamp id', function(done) {
				var values = {
					compilation_name: "InTest Compilation",
					timestamps: [{
						timestamp_id: 100, //iun
						duration: 10,
						start_time: 100
					}, {
						timestamp_id: 1,
						duration: 10,
						start_time: 100
					}]
				}
				sendRequest('newCompilation', values, /*post=*/ true).end((err, res, body) => {
					assertErrorMessage(res, 'Invalid Timestamp Id')
					done()
				})

			})



			it('should throw for missing data in timestamp', function(done) {
				var values = {
					compilation_name: "InTest Compilation",
					timestamps: [{
						timestamp_id: 1,
						duration: 10,
						start_time: 100
					}, {
						//missing timestamp id here
						duration: 10,
						start_time: 100
					}]
				}
				sendRequest('newCompilation', values, /*post=*/ true).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			it('should throw for empty timestamp', function(done) {
				var values = {
					compilation_name: "InTest Compilation",
				}
				sendRequest('newCompilation', values, /*post=*/ true).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			//should throw for invalid timesatmp id for filtering

			it('should throw for required param compilation name', function(done) {
				sendRequest('newCompilation', {}, /*post=*/ true).end((err, res, body) => {
					assertErrorMessage(res, 'Parameter validation error')
					done()
				})
			})

			it('should throw for same compilation name', function(done) {
				var values = {
					compilation_name: fakeCompilationData[0].compilation_name,
					timestamps: [{
						timestamp_id: 1,
						duration: 10,
						start_time: 100
					}, {
						timestamp_id: 1,
						duration: 10,
						start_time: 100
					}]

				}
				sendRequest('newCompilation', values, /*post=*/ true).end((err, res, body) => {
					assertErrorMessage(res, 'Compilation name already used')
					done()
				})
			})
		})
		//check that timestamp_id exists

	})


});