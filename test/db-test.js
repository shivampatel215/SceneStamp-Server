var assert = require('assert');
const expect = require('chai').expect;
var sinon = require('sinon')

var dbActions = require('../prod2/database_actions')
var cred = require('../prod2/credentials')

/*
	Testing the sql queries that are created
*/

describe('db tests', () => {

	var sandbox;

	var sqlQuery;
	var sqlValues;

	var fakeBaton;
	var FAKE_START_TIME = 200;

	function jsonToArray(table, values) {
		var values_array = []
		values.forEach(function(value) {
			var single = []
			Object.keys(dbActions.SCHEME[table]).forEach(function(attr) {
				single.push(value[attr])
			})
			values_array.push(single)
		})
		return values_array
	}

	function jsonToUpdateValuesOrCondition(values) {
		var result = Object.keys(values).map(attr => attr + '=' + (typeof values[attr] == 'string' ? "'" + values[attr] + "'" : values[attr]))
		if (Object.keys(values).length === 1) return result[0]
		return result.join(',')
	}


	beforeEach(() => {

		sqlQuery = null;
		sandbox = sinon.createSandbox()

		fakeBaton = {
			methods: [],
			err: [],
			start_time: FAKE_START_TIME,
			db_limit: {},
			addMethod: function(method) {
				this.methods.push(method)
			},
			setError(err) {
				this.err.push(err)
			}
		}


		sandbox.stub(dbActions, "_makequery").callsFake((sql, values, table, baton, callback) => {
			sqlQuery = sql
			sqlValues = values
			callback([])
		})

		dbActions.setPermanentValues({
			categories: []
		})
	})

	afterEach(function() {
		dbActions.resetPermanantValues()
		sandbox.restore()
	})

	describe('get correct pool', function() {

		it('should get the general pool', done => {
			var pool = dbActions.getPool('timestamps')
			expect(pool).to.equal(cred.pools.pool )
			done()
		})

		it('should get the user pool', done => {
			var pool = dbActions.getPool('user')
			expect(pool).to.equal(cred.pools.user_pool)
			done()
		})
	})


	describe('query construction', function() {

		var originalscheme = dbActions.DB_SCHEME
		beforeEach(function() {

			dbActions.setScheme({
				'test_table': {
					'test_attr1': {
						'type': 'number'
					},
					'test_attr2': {
						'type': 'number',
						'optional': true
					},
					'test_attr3': {
						'type': 'string',
						'optional': true
					}
				},
			})
		})

		afterEach(function() {
			dbActions.resetScheme()
		})

		describe('select query', function() {
			it('should make select call', () => {
				var queryParams = {
					test_attr1: [1, 2]
				}
				dbActions._selectQuery(fakeBaton, 'test_table', queryParams, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table` WHERE test_attr1 = 1 OR test_attr1 = 2')
				})
			})

			it('should add limit query if set in baton', () => {
				fakeBaton.db_limit.test_table = {
					offset: 2,
					order_attr : 'test_attr1'
				}
				dbActions._selectQuery(fakeBaton, 'test_table', {}, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table`ORDER BY test_attr1 DESC LIMIT 100 OFFSET 100')
				})
			})

			it('should add limit query if set in baton, where offset is 1', () => {
				fakeBaton.db_limit.test_table = {
					offset: 1,
					order_attr : 'test_attr2'
				}
				dbActions._selectQuery(fakeBaton, 'test_table', {}, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table`ORDER BY test_attr2 DESC LIMIT 100 OFFSET 0')
				})
			})

			it('should create less than and greater that conditions', () => {
				var queryParams = {
					lessThan: {
						test_attr1: 101
					},
					greaterThan: {
						test_attr1: 10
					}
				}
				dbActions._selectQuery(fakeBaton, 'test_table', queryParams, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table` WHERE test_attr1 < 101 AND test_attr1 > 10')
				})
			})


			it('should create less than and greater that conditions with normal = conditions', () => {
				var queryParams = {
					test_attr3: ['text1', 'text2'],
					lessThan: {
						test_attr1: 101
					},
					greaterThan: {
						test_attr1: 10
					}
				}
				dbActions._selectQuery(fakeBaton, 'test_table', queryParams, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table` WHERE test_attr3 = \'text1\' OR test_attr3 = \'text2\'  AND test_attr1 < 101 AND test_attr1 > 10')
				})
			})



		})

		describe('insert query', function() {
			it('should make insert multi call', () => {
				var values = [{
					test_attr1: 101,
					test_attr2: 101
				}, {
					test_attr1: 103
				}, {
					test_attr1: 102,
					test_attr2: 102
				}]
				dbActions._insertMultipleQuery('test_table', values, fakeBaton, function() {
					expect(sqlValues).to.deep.equal([
						[
							[101, 101, null],
							[103, null, null],
							[102, 102, null]
						]
					])
				})
			})

			it('should throw error for non optional field', () => {
				var values = {
					test_attr2: 101
				}
				dbActions._insertMultipleQuery('test_table', [values], fakeBaton, function() {
					expect(fakeBaton.err[0].details).to.equal('DB Actions: non-optional value not present')
				})
			})

			it('should throw error for invalid type field', () => {
				var values = [{
					test_attr2: 101,
					test_attr1: 1
				}, {
					test_attr2: 101,
					test_attr1: 'test'
				}]
				dbActions._insertMultipleQuery('test_table', values, fakeBaton, function() {
					expect(fakeBaton.err[0].details).to.equal('DB Actions: type of value not valid')
				})
			})
		})

	})

	describe('update query', () => {

		var originalscheme = dbActions.DB_SCHEME
		beforeEach(function() {

			dbActions.setScheme({
				'test_table': {
					'test_attr1': {
						'type': 'number'
					},
					'test_attr2': {
						'type': 'number',
					},
					'test_attr3': {
						'type': 'string'
					}
				},
			})
		})



		afterEach(function() {
			dbActions.resetScheme()
		})

		it('should make mass update query', (done) => {
			var condition_attr = 'test_attr1'
			var values = [{
				test_attr1: 101,
				test_attr3: "InTest 1 String Mass Update"
			}, {
				test_attr1: 201,
				test_attr3: "InTest 2 String Mass Update"
			}]

			dbActions._massUpdate(fakeBaton, 'test_table', values, condition_attr, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE test_table set test_attr3=CASE WHEN test_attr1=101 THEN \'InTest 1 String Mass Update\' WHEN test_attr1=201 THEN \'InTest 2 String Mass Update\' ELSE test_attr3 END WHERE test_attr1 IN (101,201)')
				done()
			})
		})


		it('should make update query', (done) => {
			var values = {
				test_attr3: 'intest_value',
				test_attr2: 101,
			}
			var conditions = {
				test_attr1: 300
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE `test_table` SET ' + jsonToUpdateValuesOrCondition(values) + ' WHERE ' + jsonToUpdateValuesOrCondition(conditions))
				done()
			})
		})

		it('should make update query with string conditional', (done) => {
			var values = {
				test_attr1: 300,
				test_attr2: 101,
			}
			var conditions = {
				test_attr3: 'intest_value'
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE `test_table` SET ' + jsonToUpdateValuesOrCondition(values) + ' WHERE ' + jsonToUpdateValuesOrCondition(conditions))
				done()
			})
		})

		it('should throw for invalid param type', (done) => {
			var values = {
				test_attr3: 101, //should be string
				test_attr2: 101,
			}
			var conditions = {
				test_attr1: 300
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(fakeBaton.err[0].details).to.equal('DB Actions: type of value not valid')
				done()
			})
		})

		it('should throw for more than one condition', (done) => {
			var values = {
				test_attr3: 'InTest string',
			}
			var conditions = {
				test_attr1: 300,
				test_attr2: 101
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(fakeBaton.err[0].details).to.equal('DB Actions: only one condition is allowed for update query')
				done()
			})
		})

		it('should throw for invalid attr', (done) => {
			var values = {
				test_attr3: 'InTest string',
				test_attr2: 101,
				invalid_attr: '101'
			}
			var conditions = {
				test_attr1: 300,
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(fakeBaton.err[0].details).to.equal('DB Actions: invalid attr for table')
				done()
			})
		})
	})

	describe('roles and actions', function() {
		it('get all role data', () => {

			dbActions.getAllRoleData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `role`');
			})
		})

		it('get all action data', () => {

			dbActions.getAllActionData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `action`');
			})
		})
		it('get all role and action data', () => {

			dbActions.getAllRoleActionData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `role_action`');
			})
		})
	})

	describe('series', function() {
		it('get all series data', () => {

			dbActions.getAllSeriesData(fakeBaton, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `series`');
			})
		})

		it('insert new series', () => {

			var values = {
				series_id: 101,
				series_name: 'InTest Series Name'
			}

			dbActions.insertSeries(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `series` (series_id,series_name) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('series', [values])])
			})
		})
	})

	describe('character', function() {
		it('should get all character data', () => {
			dbActions.getAllCharacterData(fakeBaton, {}, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `character`');
			})
		})

		it('should filter for character name', () => {
			var character_name = 'mark'
			dbActions.getAllCharacterData(fakeBaton, {
				character_name: [character_name]
			}, () => {
				expect(sqlQuery.trim()).to.equal('SELECT * FROM `character` WHERE character_name = \'' + character_name + '\'');
			})
		})

		it('should filter for character name (similar)', () => {
			var character_name = '%mark%'
			dbActions.getAllCharacterData(fakeBaton, {
				character_name: [character_name]
			}, () => {
				expect(sqlQuery.trim()).to.equal('SELECT * FROM `character` WHERE character_name LIKE \'' + character_name + '\'');
			})
		})

		it('insert character', (done) => {

			var values = {
				character_id: 101,
				character_name: 'InTest Character'
			}

			dbActions.insertCharacter(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `character` (character_id,character_name,nba_player_id) VALUES ?');
				values.nba_player_id = null
				expect(sqlValues).to.deep.equal([jsonToArray('character', [values])])
				done()
			})
		})

		it('insert character with nba player id', (done) => {

			var values = {
				character_id: 101,
				character_name: 'InTest Character',
				nba_player_id: 500000
			}

			dbActions.insertCharacter(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `character` (character_id,character_name,nba_player_id) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('character', [values])])
				done()
			})
		})
	})

	describe('category', function() {
		it('should get all category data', () => {
			dbActions.getAllCategoryData(fakeBaton, {}, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `category`');
			})
		})

		it('should filter for category name', () => {
			var category_name = 'funny'
			dbActions.getAllCategoryData(fakeBaton, {
				category_name: [category_name]
			}, () => {
				expect(sqlQuery.trim()).to.equal('SELECT * FROM `category` WHERE category_name = \'' + category_name + '\'');
			})
		})

		it('should filter for category name (similar)', () => {
			var category_name = '%funny%'
			dbActions.getAllCategoryData(fakeBaton, {
				category_name: [category_name]
			}, () => {
				expect(sqlQuery.trim()).to.equal('SELECT * FROM `category` WHERE category_name LIKE \'' + category_name + '\'');
			})
		})
	})

	describe('episode', function() {
		it('should get all episode data no series ids', () => {

			dbActions.getAllEpisodeData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `episode`');
			})

		})

		it('should get all episode data with episode ids', () => {
			var data = {
				episode_id: [1, 2]
			}
			dbActions.getAllEpisodeData(fakeBaton, data, () => {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `episode` WHERE episode_id = 1 OR episode_id = 2");
			})
		})

		it('should get all episode data with series ids', () => {

			var data = {
				series_id: [1, 2]
			}
			dbActions.getAllEpisodeData(fakeBaton, data, () => {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `episode` WHERE series_id = 1 OR series_id = 2");
			})

		})

		it('should get all episode data with youtube id', () => {

			var data = {
				youtube_id: ['testYoutubeid']
			}

			dbActions.getAllEpisodeData(fakeBaton, data, () => {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `episode` WHERE youtube_id = '" + data.youtube_id + "'");
			})

		})

		it('should get all episode data with nba game id', () => {

			var data = {
				nba_game_id: ['101']
			}

			dbActions.getAllEpisodeData(fakeBaton, data, () => {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `episode` WHERE nba_game_id = '" + data.nba_game_id + "'");
			})

		})

		it('should update episode', (done) => {
			var values = {
				episode_name: 'New Episode Name'
			}

			var conditions = {
				episode_id: 101
			}

			dbActions.updateEpisode(fakeBaton, values, conditions, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE `episode` SET ' + jsonToUpdateValuesOrCondition(values) + ' WHERE ' + jsonToUpdateValuesOrCondition(conditions));
				done()
			})
		})


		it('insert new episode', () => {

			var values = {
				episode_id: 101,
				episode_name: 'InTest Episode',
				series_id: 1
			}

			dbActions.insertEpisode(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `episode` (episode_id,creation_time,episode_name,series_id,air_date,youtube_id,nba_game_id,nba_start_time,video_offset) VALUES ?');
				values.air_date = null
				values.youtube_id = null
				values.nba_game_id = null
				values.nba_start_time = null
				values.video_offset = null
				values.creation_time = FAKE_START_TIME
				expect(sqlValues).to.deep.equal([jsonToArray('episode', [values])])
			})
		})

		it('insert multiple episodes', () => {

			var values = [{
				episode_id: 101,
				episode_name: 'InTest Episode 1',
				series_id: 1
			}, {
				episode_id: 102,
				episode_name: 'InTest Episode 2',
				series_id: 1
			}]

			dbActions.insertEpisode(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `episode` (episode_id,creation_time,episode_name,series_id,air_date,youtube_id,nba_game_id,nba_start_time,video_offset) VALUES ?');

				values = values.map(val => {
					val.air_date = null
					val.youtube_id = null
					val.nba_game_id = null
					val.nba_start_time = null
					val.video_offset = null
					val.creation_time = FAKE_START_TIME
					return val
				})
				expect(sqlValues).to.deep.equal([jsonToArray('episode', values)])
			})
		})

		it('insert new episode with youtube id', () => {

			var values = {
				episode_id: 101,
				episode_name: 'InTest Episode',
				series_id: 1,
				youtube_id: 'abc'
			}

			dbActions.insertEpisode(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `episode` (episode_id,creation_time,episode_name,series_id,air_date,youtube_id,nba_game_id,nba_start_time,video_offset) VALUES ?');
				delete values.youtube_id
				values.air_date = null
				values.youtube_id = 'abc'
				values.nba_game_id = null
				values.nba_start_time = null
				values.video_offset = null
				values.creation_time = FAKE_START_TIME
				expect(sqlValues).to.deep.equal([jsonToArray('episode', [values])])
			})
		})

		it('insert new episode with nba game id', () => {

			var values = {
				episode_id: 101,
				episode_name: 'InTest Episode',
				series_id: 1,
				nba_game_id: '201',
				nba_start_time: 10001
			}

			dbActions.insertEpisode(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `episode` (episode_id,creation_time,episode_name,series_id,air_date,youtube_id,nba_game_id,nba_start_time,video_offset) VALUES ?');
				delete values.nba_game_id
				values.air_date = null
				values.youtube_id = null
				values.nba_game_id = '201'
				values.nba_start_time = 10001
				values.video_offset = null
				values.creation_time = FAKE_START_TIME
				expect(sqlValues).to.deep.equal([jsonToArray('episode', [values])])
			})
		})

	})

	describe('timestamp ', function() {
		it('get all timestamp category data', function() {
			dbActions.getAllTimestampCategory(fakeBaton, {}, function() {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `timestamp_category`");
			})
		})

		it('get all timestamp category data filtered category ', function() {
			dbActions.getAllTimestampCategory(fakeBaton, {
				category_id: [1, 2]
			}, function() {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `timestamp_category` WHERE category_id = 1 OR category_id = 2");
			})
		})

		it('remove timestamp category ', function() {
			dbActions.removeTimestampCategory(fakeBaton, [1], function() {
				expect(sqlQuery.trim()).to.equal("DELETE FROM `timestamp_category` WHERE timestamp_id = 1");
			})

		})

		it('insert multiple timestamp self', () => {
			var values = [{
				episode_id: 101,
				start_time: 100,
				timestamp_id: 100
			}, {
				episode_id: 102,
				start_time: 1400,
				timestamp_id: 140
			}]

			dbActions.insertTimestamp(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `timestamp` (episode_id,creation_time,start_time,timestamp_id,user_id,nba_timestamp_id,nba_play_description) VALUES ?');
				values = values.map(val => {
					val.user_id = null
					val.creation_time = FAKE_START_TIME
					val.nba_timestamp_id = null
					val.nba_play_description = null
					return val
				})
				expect(sqlValues).to.deep.equal([jsonToArray('timestamp', values)])
			})
		})

		it('insert timestamp self', () => {
			var values = {
				episode_id: 101,
				start_time: 100,
				timestamp_id: 100
			}

			dbActions.insertTimestamp(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `timestamp` (episode_id,creation_time,start_time,timestamp_id,user_id,nba_timestamp_id,nba_play_description) VALUES ?');
				values.user_id = null
				values.creation_time = FAKE_START_TIME
				values.nba_timestamp_id = null
				values.nba_play_description = null
				expect(sqlValues).to.deep.equal([jsonToArray('timestamp', [values])])
			})
		})

		it('insert timestamp self with user id', () => {
			var values = {
				episode_id: 101,
				start_time: 100,
				timestamp_id: 100
			}

			fakeBaton.user_id = 1001

			dbActions.insertTimestamp(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `timestamp` (episode_id,creation_time,start_time,timestamp_id,user_id,nba_timestamp_id,nba_play_description) VALUES ?');
				values.user_id = fakeBaton.user_id
				values.creation_time = FAKE_START_TIME
				values.nba_timestamp_id = null
				values.nba_play_description = null
				expect(sqlValues).to.deep.equal([jsonToArray('timestamp', [values])])
			})
		})

		it('insert timestamp self with nba description and timestamp id', () => {
			var values = {
				episode_id: 101,
				start_time: 100,
				timestamp_id: 100,
				nba_play_description: 'InTest play description',
				nba_timestamp_id: 'Intest timestmp id'
			}

			fakeBaton.user_id = 1001

			dbActions.insertTimestamp(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `timestamp` (episode_id,creation_time,start_time,timestamp_id,user_id,nba_timestamp_id,nba_play_description) VALUES ?');
				values.user_id = fakeBaton.user_id
				values.creation_time = FAKE_START_TIME
				values.nba_timestamp_id = 'Intest timestmp id'
				values.nba_play_description = 'InTest play description'
				expect(sqlValues).to.deep.equal([jsonToArray('timestamp', [values])])
			})
		})

		it('insert timestamp category', () => {

			var values = [{
				timestamp_id: 1,
				category_id: 3
			}, {
				timestamp_id: 1,
				category_id: 3
			}]


			dbActions.insertTimestampCategory(fakeBaton, values, () => {

				expect(sqlQuery).to.equal('INSERT INTO `timestamp_category` (timestamp_id,category_id) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('timestamp_category', values)])
			})
		})

		it('get all timestamp chracter data', function() {
			dbActions.getAllTimestampCharacter(fakeBaton, {}, function() {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `timestamp_characters`");
			})
		})

		it('get all timestamp category data filted chracter and timestamp ', function() {
			dbActions.getAllTimestampCharacter(fakeBaton, {
				character_id: [1, 2],
				timestamp_id: [1]
			}, function() {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `timestamp_characters` WHERE timestamp_id = 1  OR character_id = 1 OR character_id = 2");
			})
		})

		it('insert timestamp character', () => {

			var values = [{
				timestamp_id: 1,
				character_id: 2
			}, {
				timestamp_id: 3,
				character_id: 4
			}, {
				timestamp_id: 5,
				character_id: 6
			}]

			dbActions.insertTimestampCharacter(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `timestamp_characters` (timestamp_id,character_id) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('timestamp_characters', values)])
			})
		})

		it('remove timestamp character ', function() {
			dbActions.removeTimestampCharacter(fakeBaton, [1], function() {
				expect(sqlQuery.trim()).to.equal("DELETE FROM `timestamp_characters` WHERE timestamp_id = 1");
			})

		})
	})

	describe('compilation', function() {

		it('should get all compilation data ', () => {

			dbActions.getAllCompilationData(fakeBaton, {}, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `compilation`');
			})

		})

		it('get all compilation timestamp data', function() {
			dbActions.getAllCompilationTimestamp(fakeBaton, {}, function() {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `compilation_timestamp`");
			})
		})

		it('get all compilation timestamp data filtered ', function() {
			dbActions.getAllCompilationTimestamp(fakeBaton, {
				compilation_id: [1, 2],
				timestamp_id: [5]
			}, function() {
				expect(sqlQuery.trim()).to.equal("SELECT * FROM `compilation_timestamp` WHERE compilation_id = 1 OR compilation_id = 2  OR timestamp_id = 5");
			})
		})

		it('insert new compilation query', () => {

			var values = {
				compilation_id: 1,
				compilation_name: 'InTest Compilation'
			}

			dbActions.insertCompilation(fakeBaton, values, () => {
				values.creation_time = FAKE_START_TIME
				expect(sqlQuery).to.equal('INSERT INTO `compilation` (compilation_id,creation_time,compilation_name) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('compilation', [values])])
			})

		})

		it('insert compilation timestamp', () => {

			var values = [{
				compilation_id: 1,
				timestamp_id: 2,
				duration: 100,
				start_time: 30
			}]

			dbActions.insertCompilationTimestamp(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `compilation_timestamp` (compilation_id,timestamp_id,duration,start_time) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('compilation_timestamp', values)])
			})
		})

	})

})