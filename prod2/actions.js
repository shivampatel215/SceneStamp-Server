var db = require('./database_actions');
var stub_db = require('./stub_database');
var cred = require('./credentials')
var logger = require('./logger').MAIN_LOGGER
var baton = require('./baton')
var endpointRequestParams = require('./endpointRequestParams')
var async = require('async');
var http = require('http')

var nba_fetching = require('./nba_fetching')

/**

GENERAL DESIGN

Private functions : start with '_'
Direct API functions : start with 'post' or 'get'
  -All such calls will create and pass the 'baton' to following functions
*/


var ID_LENGTH = {
  'series': 5,
  'episode': 6,
  'character': 7,
  'timestamp': 9,
  'category': 5,
  'user': 9
}

var ACTION_VALIDATION = endpointRequestParams.MAIN_VALIDATION

module.exports = {

  ACTION_VALIDATION: ACTION_VALIDATION,
  setActionValidation(actionValidation) {
    ACTION_VALIDATION = actionValidation
  },
  resetActionValidation() {
    ACTION_VALIDATION = endpointRequestParams.MAIN_VALIDATION
  },
  //the above is for testing only

  UTC_REGEX: /^\s*(\d{4})-(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)\s+UTC\s*$/,
  convertUtcToEpoch(utc_time) {
    if (utc_time === undefined) return null
    var m = (utc_time).match(this.UTC_REGEX);
    return (m) ? Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]) : null;
  },

  ID_LENGTH: ID_LENGTH,

  convertParams(baton, params, action, callback) {

    var throwConversionError = (attr) => {
      baton.setError({
        sub_attr: attr
      })
      callback(NaN)
    }

    function checkCustom(customObj, obj, callback) {
      var index = 0
      var updated_obj = {}
      Object.keys(customObj).every(attr => {
        if (customObj[attr] == 'array') {
          if (Array.isArray(obj[attr]) && !obj[attr].map(val => parseInt(val)).includes(NaN)) {
            index++;
            return true
          }
          return false
        } else if (customObj[attr] == typeof obj[attr]) {
          index++;
          return true
        } else {
          baton.setError({
            sub_attr: attr
          })
          return false
        }
      })
      if (index === Object.keys(customObj).length) callback(obj)
      else callback(NaN)
    }
    var update_params = {}
    var index = 0
    Object.keys(ACTION_VALIDATION[action]).every(attr => {
      if (params[attr] == null || params[attr] == undefined) update_params[attr] = null
      else {
        update_params[attr] = (baton.requestType == 'GET' ? params[attr].split(',') : (Array.isArray(params[attr]) ? params[attr] : [params[attr]])).map(arrayValue => {
          switch (ACTION_VALIDATION[action][attr].type) {
            case 'string':
              return (typeof arrayValue === 'string' ? arrayValue : NaN)
            case 'number':
              return parseInt(arrayValue)
            case 'boolean':
              if (arrayValue !== 'true' && arrayValue !== 'false') {
                return NaN
              }
              return arrayValue === 'true'
            default: //the param type is custom 
              var value;
              checkCustom(endpointRequestParams.CUSTOM_OBJECTS[ACTION_VALIDATION[action][attr].type], arrayValue, val => {
                value = val;
              })
              return value
          }
        })
      }
      index++;
      if (index === Object.keys(ACTION_VALIDATION[action]).length) {
        callback(update_params)
      } else {
        return true
      }
    })
  },

  validateRequest(baton, params, action, callback) {
    var t = this

    function throwInvalidParam(attr, error_detail, sub_attr) {

      baton.setError({
        error_detail: error_detail,
        action: action,
        attr: attr,
        sub_attr: (sub_attr ? sub_attr : undefined),
        public_message: 'Parameter validation error'
      })
      t._generateError(baton)
    }

    if (ACTION_VALIDATION[action] !== undefined) {
      this.convertParams(baton, params, action, updated_params => {
        var index = 0
        Object.keys(ACTION_VALIDATION[action]).every(attr => {
          if (updated_params[attr] === null) {
            if (ACTION_VALIDATION[action][attr].optional !== true) {
              throwInvalidParam(attr, 'Attibute value missing')
              return false
            }
            delete updated_params[attr]
          } else {
            if (updated_params[attr].includes(NaN)) {
              var existing = {};
              if (baton.err[0]) {
                existing = baton.err[0]
                baton.err = []
              }
              throwInvalidParam(attr, 'Invalid Attribute Type', existing.sub_attr)
              return false
            } else if (ACTION_VALIDATION[action][attr].multiple !== true && updated_params[attr].length > 1) {
              throwInvalidParam(attr, 'Single Value is Expected')
              return false
            }
          }
          if (ACTION_VALIDATION[action][attr].multiple !== true && updated_params[attr] !== undefined) updated_params[attr] = updated_params[attr][0]
          index++;
          if (index === Object.keys(ACTION_VALIDATION[action]).length) {
            callback(updated_params)
          } else return true
        })
        //function goes here when something fails
        //b/c throwsInvalidParam is called, the response is given
      })
    } else {
      callback({})
    }
  },
  get_allSeriesData(baton, params, res) {
    this.getAllSeriesData(baton, function(data) {
      baton.json(data)
    });
  },
  getAllSeriesData(baton, callback) {
    baton.addMethod('getAllSeriesData');
    var t = this;
    db.getAllSeriesData(baton, function(data) {
      t._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },
  post_newSeries(baton, params, res) {
    var t = this;

    getSeriesData()

    function getSeriesData() {
      t.getAllSeriesData(baton, ensureUniqueSeriesName);
    }

    function ensureUniqueSeriesName(series_data) {
      var passedSeriesName = baton.params.series_name
      series_names = series_data.map(function(ser) {
        return ser.series_name.toLowerCase()
      })
      if (series_names.includes(passedSeriesName.toLowerCase())) {
        baton.setError({
          error: "existing series name",
          series_name: passedSeriesName,
          public_message: 'Series Name exists'
        })
        t._generateError(baton)
        return
      }
      addNewSeries(series_data);
    }

    function addNewSeries(series_data) {
      var id = t._generateId(ID_LENGTH.series, series_data.map(function(series) {
        return series.series_id
      }));
      db.insertSeries(baton, {
        'series_id': id,
        'series_name': baton.params.series_name
      }, function(new_series) {
        t._handleDBCall(baton, new_series, false /*multiple*/ , function(data) {
          baton.json(data)
        })
      })
    }
  },
  get_allEpisodeData(baton, params, res) {
    var t = this;

    var verifyParams = (callback) => {
      if (params.youtube_link && t.youtubeLinkParser(params.youtube_link) == null) {
        baton.setError({
          youtube_link: params.youtube_link,
          youtube_id: t.youtubeLinkParser(params.youtube_link),
          error: "Youtube Link is not valid, pattern wise",
          public_message: 'Invalid Youtube Link'
        })
        t._generateError(baton)
        return
      }
      callback()
    }

    function getEpisodeData() {
      var queryParams = {
        series_id: params.series_ids,
        youtube_id: (params.youtube_link ? [t.youtubeLinkParser(params.youtube_link)] : null),
        nba_game_id: params.nba_game_ids
      }
      if (params.nbaBeforeEpochTime) queryParams.lessThan = {
        nba_start_time: params.nbaBeforeEpochTime
      }
      if (params.nbaAfterEpochTime) queryParams.greaterThan = {
        nba_start_time: params.nbaAfterEpochTime
      }
      t.getAllEpisodeData(baton, queryParams, function(data) {
        baton.json(data)
      })
    }

    verifyParams(() => {
      getEpisodeData()
    })
  },
  getAllEpisodeData(baton, queryData, callback) {
    baton.addMethod('getAllEpisodeData');
    var t = this;
    db.getAllEpisodeData(baton, queryData, function(data) {
      t._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  get_allCompilationData(baton, params, res) {
    var t = this;

    t.getAllCompilationData(baton, params, function(data) {
      baton.json(data)
    });
  },

  getAllCompilationData(baton, params, callback) {
    baton.addMethod('getAllCompilationData');
    var t = this;

    function addInTimestampData(compilation_data, compilation_timestamp, callback) {
      callback(compilation_data.map(function(cp) {
        cp.timestamps = compilation_timestamp.filter((ct) => {
          return ct.compilation_id == cp.compilation_id
        })
        return cp
      }))
    }

    function getCompilationData(compilation_ids, callback) {
      db.getAllCompilationData(baton, {
        compilation_id: (params.timestamp_ids || params.compilation_ids ? compilation_ids : null)
      }, function(data) {
        t._handleDBCall(baton, data, false /*multiple*/ , callback)
      })
    }


    function getCompilationTimestampData(data, callback) {
      db.getAllCompilationTimestamp(baton, {
        timestamp_id: data.timestamp_ids,
        compilation_id: data.compilation_ids,
      }, function(data) {
        t._handleDBCall(baton, data, false /*multiple*/ , callback)
      })
    }

    function dataLoader(params, callback) {
      //first get all of the compilation and timestamp data
      //if there is timestamp_ids passed in, should filter 
      getCompilationTimestampData(params, function(compilation_timestamp) {
        //get all of the compilation data
        //if there is timestamp ids provided, only need to get the the compilation ids that are filtered
        getCompilationData((compilation_timestamp.length > 0 ? [...compilation_timestamp.map(function(ct) {
          return ct.compilation_id
        })] : [-1]), function(compilation_data) {
          //after getting all of the compilation ids, we now need to get all of the timestamps connected to those compilation ids
          getCompilationTimestampData({
            compilation_ids: (compilation_data.length > 0 ? compilation_data.map((cp) => {
              return cp.compilation_id
            }) : null)
          }, function(filtered_compilation_timestamp) {
            callback(compilation_data, filtered_compilation_timestamp)
          })
        })
      })
    }

    dataLoader(params, function(compilation_data, compilation_timestamp) {
      addInTimestampData(compilation_data, compilation_timestamp, function(updateCompilationData) {
        callback(updateCompilationData)
      })
    })
  },

  get_compilationDescription(baton, params, res) {

    var getEpisodeFromCompilationTimestamps = (timestamps, callback) => {

      var getUnique = (value, index, self) => self.indexOf(value) === index

      var getTimestampIds = (timestamps, callback) => {
        callback(timestamps
          .map(timestamp => timestamp.timestamp_id)
          .filter(getUnique));
      }

      var getEpisodeIdsFromTimestampIds = (baton, timestamp_ids, callback) => {
        this.getAllTimestampData(baton, {
          timestamp_ids: timestamp_ids
        }, function(timestamp_data) {
          callback(timestamp_data.map(timestamp => timestamp.episode_id).filter(getUnique))
        })
      }

      var getYoutubeURL = (youtube_id) => {
        return "https://www.youtube.com/watch?v=" + youtube_id
      }

      var getLinksFromEpisodeIds = (baton, episode_ids, callback) => {
        this.getAllEpisodeData(baton, {
          episode_id: episode_ids
        }, function(episode_data) {
          callback(episode_data.filter(ep => ep.youtube_id !== null).map(ep => ep.episode_name + ":" + getYoutubeURL(ep.youtube_id)))
        })
      }
      getTimestampIds(timestamps, timestamp_ids => {
        getEpisodeIdsFromTimestampIds(baton, timestamp_ids, (episode_ids) => {
          getLinksFromEpisodeIds(baton, episode_ids, (links) => {
            callback(links)
          })
        })
      })
    }

    this.getAllCompilationData(baton, {
      compilation_ids: [params.compilation_id]
    }, (compilation_data) => {
      getEpisodeFromCompilationTimestamps(compilation_data[0].timestamps, links => {
        baton.json({
          links: links
        })
      })
    })

  },

  post_newCompilation(baton, params, res) {
    var t = this;

    function createCompilationId(params, compilation_data, callback) {
      t.getAllCompilationData(baton, params, function(compilation_data) {
        params.compilation_id = t._generateId(ID_LENGTH.timestamp, compilation_data.map(function(cp) {
          return cp.compilation_id
        }))
        callback(params)
      })
    }

    function ensureRequiredParamsPresent(params, compilation_data, callback) {
      if (compilation_data.map(function(cp) {
          return cp.compilation_name
        }).includes(params.compilation_name)) {
        baton.setError({
          compilation_name: params.compilation_name,
          error: "Compilation name already exists",
          public_message: 'Compilation name already used'
        })
        t._generateError(baton)
        return
      }
      if (params.timestamps && params.timestamps.length == 0) {
        baton.setError({
          timestamps: params.timestamps,
          error: "Timestamps cannot be empty",
          public_message: 'Required params not present'
        })
        t._generateError(baton)
        return
      }
      t.ensure_TimestampIdExists(baton, {

        timestamp_id: [...new Set(params.timestamps.map(timestamp => {
          return timestamp.timestamp_id
        }))]
      }, function() {
        createCompilationId(params, compilation_data, callback)
      })
    }


    function verifyParams(compilation_data, callback) {
      ensureRequiredParamsPresent(params, compilation_data, function() {
        callback(params)
      })
    }

    function insertNewCompilation(params, callback) {
      db.insertCompilation(baton, params, function(data) {
        t._handleDBCall(baton, data, true /*multiple*/ , callback)
      })
    }

    function insertCompilationTimestamps(compilation_id, timestamps, callback) {
      var values = timestamps.map(function(ts) {
        return {
          compilation_id: compilation_id,
          timestamp_id: ts.timestamp_id,
          duration: ts.duration,
          start_time: ts.start_time
        }
      })
      db.insertCompilationTimestamp(baton, values, function(data) {
        t._handleDBCall(baton, data, true /*multiple*/ , callback)
      })
    }

    function insertAllData(params, suc_callback) {
      var tasks = {}
      tasks.compilation = function(callback) {
        insertNewCompilation({
          compilation_id: params.compilation_id,
          compilation_name: params.compilation_name
        }, callback)
      }
      tasks.timestamps = function(callback) {
        insertCompilationTimestamps(params.compilation_id, params.timestamps, callback)
      }

      async.parallel(tasks,
        function(err, results) {
          if (err) {
            baton.setError(err)
            t._generateError(baton);
            return
          } else {
            results.compilation.timestamps = params.timestamps
            suc_callback(results.compilation)
          }
        });
    }

    function dataLoader(callback) {
      t.getAllCompilationData(baton, {}, function(compilation_data) {
        callback(compilation_data)
      })
    }

    //execute
    dataLoader(function(compilation_data) {
      verifyParams(compilation_data, function(params) {
        insertAllData(params, function(compilatin_added) {
          baton.json(compilatin_added)
        })
      });
    })
  },

  youtubeLinkParser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    if (match && match[7].length == 11) {
      return match[7];
    } else {
      return null
    }
  },

  post_newEpisode(baton, params, res) {
    var t = this;

    var ensureEpisodeParamsIsUnique = (params, callback) => {
      t.getAllEpisodeData(baton, {}, (episode_data) => {
        if (episode_data.map(function(ep) {
            return ep.episode_name.toLowerCase()
          }).includes(params.episode_name.toLowerCase())) {
          baton.setError({
            episode_name: params.episode_name,
            error: "Episode Name exists",
            public_message: 'Episode Name exists'
          })
          t._generateError(baton)
          return
        }
        if (params.youtube_id !== undefined && episode_data.find(function(ep) {
            return ep.youtube_id == params.youtube_id
          }) !== undefined) {
          baton.setError({
            youtube_id: params.youtube_id,
            youtube_link: params.youtube_link,
            error: "Episode exists with youtube id",
            public_message: 'Youtube Id already Registered'
          })
          t._generateError(baton)
          return
        } else if (params.nba_game_id !== undefined) {
          if (episode_data.find(function(ep) {
              return ep.nba_game_id == params.nba_game_id
            }) !== undefined) {
            baton.setError({
              nba_game_id: params.nba_game_id,
              error: "Episode exists with nba game id",
              public_message: 'NBA Game Id already Registered'
            })
            t._generateError(baton)
            return
          }
          if (params.nba_start_time === undefined || this.convertUtcToEpoch(params.nba_start_time) === null) {
            baton.setError({
              nba_start_time: params.nba_start_time,
              utc_regex_match: this.convertUtcToEpoch(params.nba_start_time),
              error: "Invalid Nba start time",
              public_message: 'NBA Start Time is invalid'
            })
            t._generateError(baton)
            return
          } else {
            params.nba_start_time = this.convertUtcToEpoch(params.nba_start_time)
          }
        }
        //update params to include generated id
        params.episode_id = t._generateId(ID_LENGTH.episode, episode_data.map(function(ep) {
          return ep.episode_id
        }))
        callback()
      })
    }

    function ensureRequiredParamsPresent(params, callback) {
      if (params.youtube_link !== null && params.youtube_link !== undefined) {
        var youtubeId = t.youtubeLinkParser(params.youtube_link)
        if (youtubeId == null) {
          baton.setError({
            youtube_link: params.youtube_link,
            youtube_id: youtubeId,
            error: "Youtube Link is not valid, pattern wise",
            public_message: 'Invalid Youtube Link'
          })
          t._generateError(baton)
          return
        }
        params.youtube_id = youtubeId
      }
      if (params.series_id !== null && params.series_id !== undefined) {

        t.ensure_SeriesIdExists(baton, params, function() {
          ensureEpisodeParamsIsUnique(params, callback)
        })
      } else {
        ensureEpisodeParamsIsUnique(params, callback)
      }
    }

    function insertNewEpisode(params, callback) {
      db.insertEpisode(baton, params, function(data) {
        t._handleDBCall(baton, data, false /*multiple*/ , callback)
      })
    }

    function verifyParams(callback) {
      ensureRequiredParamsPresent(params, function() {
        callback(params)
      })
    }

    //execute
    verifyParams(function(params) {
      insertNewEpisode(params, function(episode_added) {
        if (episode_added.youtube_id !== undefined && episode_added.youtube_id !== null) {
          t._makeDownloadYoutubeCall(baton, params, function(response) {
            episode_added.downloadResponse = response
            baton.json(episode_added)
          })
        } else {
          baton.json(episode_added)
        }
      })
    });
  },

  post_updateEpisode(baton, params) {

    var verifyParams = (callback) => {
      this.ensure_EpisodeIdExists(baton, {
        episode_id: [params.episode_id]
      }, (episode) => {
        episode = episode[0]
        if (episode.nba_game_id === undefined || episode.nba_game_id === null) {
          baton.setError({
            episode_id: params.episode_id,
            error: "Only episodes with game id can have video offset",
            public_message: 'Invalid Episode Id'
          })
          this._generateError(baton)
          return
        }
        callback(episode)
      })
    }

    var updateEpisodeWithOffset = (episode_id, callback) => {
      this.updateEpisode(baton, {
        video_offset: params.video_offset
      }, {
        episode_id: episode_id
      }, callback)
    }

    verifyParams((episode) => {
      updateEpisodeWithOffset(episode.episode_id, () => {
        baton.json({
          episode_id: episode.episode_id,
          video_offset: params.video_offset
        })
      })
    })
  },

  updateEpisode(baton, params, conditions, callback) {
    baton.addMethod('updateEpisode');
    var t = this;
    db.updateEpisode(baton, params, conditions, (data) => {
      t._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  _makeDownloadYoutubeCall(baton, params, callback) {
    var t = this;
    baton.addMethod('_makeDownloadYoutubeCall')

    var timeoutOccured = false;

    function constructUrl() {
      return cred.VIDEO_SERVER_URL + ':' + cred.VIDEO_SERVER_PORT + '/downloadYoutubeVideo?youtube_link=' + params.youtube_link + '&episode_id=' + params.episode_id
    }

    var req = http.get(constructUrl(), function(res) {
      res.on('data', function(data) {
        if (!timeoutOccured) {
          var parsedData = JSON.parse(Buffer.from(data).toString());
          if (res.statusCode == 200) {
            callback("Youtube video download in queue")
          } else {
            callback(parsedData)
            return
          }
        }
      });
    }).on('error', function(err) {
      callback({
        error: 'Error while making download youtube call to video server',
        details: err
      })
      return
    })
    req.setTimeout(500, () => {
      timeoutOccured = true;
      req.end()
      callback({
        error: 'Timeout while making download youtube call to video server',
      })
      return
    })
    req.end()
  },


  get_allCharacterData(baton, params, res) {
    var t = this;

    getCharacterData()

    function getCharacterData() {
      var queryParams = {
        //for select queries, format is (the attr from the table) : [all possible values, regardless of if 1 or multiple ]
        character_name: (params.character_name ? [params.character_name] : undefined)
      }
      t.getAllCharacterData(baton, queryParams, function(data) {
        baton.json(data)
      })
    }
  },

  getAllCharacterData(baton, queryParams, callback) {
    baton.addMethod('getAllCharacterData');
    var t = this;
    db.getAllCharacterData(baton, queryParams, function(data) {
      t._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  post_newCharacter(baton, params, res) {
    var t = this;

    function ensureCharacterNameIsUnique(params, callback) {
      t.getAllCharacterData(baton, /*queryParams=*/ {}, function(character_data) {
        if (character_data.map(function(ch) {
            return ch.character_name.toLowerCase()
          }).includes(params.character_name.toLowerCase())) {
          baton.setError({
            character_name: params.character_name,
            series_id: params.series_id,
            error: "Character Name exists",
            public_message: 'Character Name already exists'
          })
          t._generateError(baton)
          return
        }
        callback()
      })
    }


    function addCharacterId(params, callback) {
      //update params to include generated id
      t.getAllCharacterData(baton, /*queryParams=*/ {}, function(character_data) {
        params.character_id = t._generateId(ID_LENGTH.character, character_data.map(function(ch) {
          return ch.character_id
        }))
        callback(params)
      })
    }

    function verifyParams(callback) {
      ensureCharacterNameIsUnique(params, _ => {
        addCharacterId(params, callback)
      })
    }

    //execute
    verifyParams((params) => {
      this.insertNewCharacter(baton, params, function(character_added) {
        baton.json(character_added)
      })
    });

  },

  insertNewCharacter(baton, params, callback) {
    db.insertCharacter(baton, params, (data) => {
      this._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  get_allCategoryData(baton, params, res) {
    var t = this;

    var queryParams = {
      //for select queries, format is (the attr from the table) : [all possible values, regardless of if 1 or multiple ]
      category_name: (params.category_name ? [params.category_name] : undefined)
    }
    t.getAllCategoryData(baton, queryParams, function(data) {
      baton.json(data)
    })
  },

  getAllCategoryData(baton, queryParams, callback) {
    baton.addMethod('getAllCategoryData');
    var t = this;
    db.getAllCategoryData(baton, queryParams, function(data) {
      t._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  post_newCategory(baton, params, res) {
    var t = this;

    function ensureCategoryIsUnique(params, callback) {
      t.getAllCategoryData(baton, /*queryParams=*/ {}, function(category_data) {
        if (category_data.map(function(ct) {
            return ct.category_name.toLowerCase()
          }).includes(params.category_name.toLowerCase())) {
          baton.setError({
            category_name: params.category_name,
            error: "Category Name exists",
            public_message: 'Category Name exists'
          })
          t._generateError(baton)
          return
        }
        //update params to include generated id
        params.category_id = t._generateId(ID_LENGTH.category, category_data.map(function(ct) {
          return ct.category_id
        }))
        callback(params)
      })
    }

    function verifyParams(callback) {
      ensureCategoryIsUnique(params, callback)

    }

    function insertNewCategory(params, callback) {
      db.insertCategory(baton, params, function(data) {
        t._handleDBCall(baton, data, false /*multiple*/ , callback)
      })
    }

    //execute
    verifyParams(function(params) {
      insertNewCategory(params, function(character_added) {
        baton.json(character_added)
      })
    });
  },

  get_allTimestampData(baton, params, res) {
    var t = this;
    baton.db_limit.timestamp = {
      order_attr: 'creation_time',
      offset: (params.offset && params.offset > -1 ? params.offset : 1)
    }

    getTimestampData(params)

    function getTimestampData(params) {
      t.getAllTimestampData(baton, params, function(data) {
        baton.json(data)
      })
    }
  },


  getTimestampData(baton, params, callback) {
    db.getAllTimestampData(baton, params, (data) => {
      this._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  updateTimestamps(baton, values, condition_attr, callback) {
    db.updateTimestamps(baton, values, condition_attr, (data) => {
      this._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  //get character and categories for timestamps
  getAllTimestampData(baton, params, callback) {
    baton.addMethod('getAllTimestampData');
    var t = this;

    /*

      1) Get all timestamps ids that have category / character ids
          if both filter options are null, set as null
      2) get all timestamps data for said timestamp ids
          if both fiter options are null, just get timestamp data filtered by nba_timestamp, episode_id, and timestamp_id
      3) get all category and character data for each timestamp, and propogate all timestamps with data
    */


    var getFilteredTimestampIdsFromCharactersAndCategories = (suc_callback) => {
      var tasks = {}
      tasks.filteredCategories = (callback) => {
        if (!params.category_ids) {
          callback(null, null)
          return
        }
        db.getAllTimestampCategory(baton, {
          category_id: params.category_ids
        }, function(data) {
          t._handleDBCall(baton, data, true /*multiple*/ , callback)
        })
      }
      tasks.filteredCharacters = function(callback) {
        if (!params.character_ids) {
          callback(null, null)
          return
        }
        db.getAllTimestampCharacter(baton, {
          character_id: params.character_ids
        }, function(data) {
          t._handleDBCall(baton, data, true /*multiple*/ , callback)
        })
      }

      async.parallel(tasks,
        (err, results) => {
          if (err) {
            t._generateError(baton);
            return
          } else {
            if (!results.filteredCharacters && !results.filteredCategories) {
              suc_callback(null)
              return
            }
            suc_callback([]
              .concat((results.filteredCategories ? results.filteredCategories.map(ts => ts.timestamp_id) : []))
              .concat((results.filteredCharacters ? results.filteredCharacters.map(ts => ts.timestamp_id) : []))
              .filter(this._onlyUnique)
            )
          }
        });
    }



    var getTimestampsWithCharactersAndCategories = (filtered_timestamp_ids, callback) => {
      db.getAllTimestampData(baton, {
        episode_id: params.episode_ids,
        /* either filter by:
          1)filtered timestamps, which come from character and category ids
          2)passed timestamp ids, which will be null if none avaliable
        */
        timestamp_id: (filtered_timestamp_ids ? filtered_timestamp_ids : params.timestamp_ids),
        nba_timestamp_id: params.nba_timestamp_id
      }, function(data) {
        t._handleDBCall(baton, data, false /*multiple*/ , function(timestamp_data) {
          dataLoader(timestamp_data, function(results) {
            if (params.character_ids) {
              timestamp_data = timestamp_data.filter(function(timestamp) {
                return t._intersection(params.character_ids, timestamp.characters).length > 0
              });
            }
            if (params.category_ids) {
              timestamp_data = timestamp_data.filter(function(timestamp) {
                return t._intersection(params.category_ids, timestamp.categories).length > 0
              });
            }
            callback(timestamp_data)
          })
        })
      })
    }


    function dataLoader(timestamp_data, suc_callback) {
      var timestamp_ids = timestamp_data.map(function(timestamp) {
        return timestamp.timestamp_id
      })
      var tasks = {}
      tasks.allCategory = function(callback) {
        db.getAllTimestampCategory(baton, (timestamp_ids.length == 0 ? {} : {
          timestamp_id: timestamp_ids
        }), function(data) {
          t._handleDBCall(baton, data, true /*multiple*/ , callback)
        })
      }
      tasks.allCharacter = function(callback) {
        db.getAllTimestampCharacter(baton, (timestamp_ids.length == 0 ? {} : {
          timestamp_id: timestamp_ids
        }), function(data) {
          t._handleDBCall(baton, data, true /*multiple*/ , callback)
        })
      }

      async.parallel(tasks,
        function(err, results) {
          if (err) {
            t._generateError(baton);
            return
          } else {
            suc_callback(timestamp_data.map(function(timestamp) {
              timestamp.characters = results.allCharacter.filter(function(ch) {
                return ch.timestamp_id == timestamp.timestamp_id
              }).map(function(ch) {
                return ch.character_id
              });
              timestamp.categories = results.allCategory.filter(function(ct) {
                return ct.timestamp_id == timestamp.timestamp_id
              }).map(function(ct) {
                return ct.category_id
              });
              return timestamp
            }))
          }
        });
    }

    getFilteredTimestampIdsFromCharactersAndCategories(filtered_timestamps => {
      getTimestampsWithCharactersAndCategories(filtered_timestamps, (timestamp_data) => {
        callback(timestamp_data)
      })
    })

  },

  post_newTimestamp(baton, params, res) {
    var t = this;

    function createTimestampId(params, callback) {
      t.getTimestampData(baton, {}, function(timestamp_data) {
        params.timestamp_id = t._generateId(ID_LENGTH.timestamp, timestamp_data.map(function(ts) {
          return ts.timestamp_id
        }))
        callback(params)
      })
    }

    function verifyParams(callback) {
      createTimestampId(params, updated_params => {
        t.ensure_EpisodeIdExists(baton, updated_params, function() {
          callback(updated_params)
        })
      })
    }

    //execute
    verifyParams((params) => {
      this.insertTimestamp(baton, params, function(new_timestamp_data) {
        baton.json(new_timestamp_data)
      })
    });
  },


  insertTimestamp(baton, timestamps, callback) {
    db.insertTimestamp(baton, timestamps, (data) => {
      this._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },


  post_massAddTimestamp(baton, params) {


    var addTimestampIds = (params, callback) => {
      this.getAllTimestampData(baton, {}, timestamp_data => {
        callback(params.timestamps.map(ts => {
          ts.timestamp_id = this._generateId(ID_LENGTH.timestamp, timestamp_data.map(function(ts) {
            return ts.timestamp_id
          }))
          return ts
        }))

      })
    }

    var validateCategoryCharacterValues = (all_category_ids, all_character_ids, suc_callback) => {
      var createTasks = (after_task_created_callback) => {
        var tasks = []
        if (all_category_ids.length > 0) {
          tasks.push((callback) => {
            this.ensure_CategoryIdsExist(baton, all_category_ids, function(err) {
              if (err) baton.setError(err)
              callback()
            })
          })
        }

        if (all_character_ids.length > 0) {
          tasks.push((callback) => {
            this.ensure_CharacterIdsExist(baton, all_character_ids, function(err) {
              if (err) baton.setError(err)
              callback()
            })
          })
        }
        after_task_created_callback(tasks)
      }

      createTasks((tasks) => {
        async.parallel(tasks,
          (err) => {
            if (baton.err.length > 0) {
              this._generateError(baton);
            } else {
              suc_callback(params)
            }
          });
      })
    }

    var verifyParams = (callback) => {
      addTimestampIds(params, updated_timestamps => {
        this.ensure_EpisodeIdExists(baton, {
          episode_id: params.timestamps.map(ts => ts.episode_id).filter(this._onlyUnique)
        }, () => {

          var flattenArray = (arr) => {
            return [].concat.apply([], arr)
          }
          var allCategoryIds = flattenArray(updated_timestamps.map(ts => ts.category_ids))
          var allCharacterIds = flattenArray(updated_timestamps.map(ts => ts.character_ids))
          //verify all of the timestamps' category and character ids
          validateCategoryCharacterValues(allCategoryIds, allCharacterIds, () => {
            callback({
              timestamps: updated_timestamps
            }, allCategoryIds.length, allCharacterIds.length)
          })
        })
      })
    }

    var addCharactersAndCategories = (timestamps, category_ids_num, character_ids_num, suc_callback) => {
      var tasks = {}

      if (category_ids_num > 0) {
        tasks.categories = (callback) => {
          var category_values = [];
          timestamps.filter(ts => ts.category_ids.length > 0).forEach(ts => {
            ts.category_ids.forEach(cat_id => {
              category_values.push({
                timestamp_id: ts.timestamp_id,
                category_id: cat_id
              });
            })
          })
          this.insertTimestampCategory(baton, category_values, /*multiple=*/ true, callback)
        }
      }
      if (character_ids_num > 0) {
        tasks.characters = (callback) => {
          var character_values = [];
          timestamps.filter(ts => ts.character_ids.length > 0).forEach(ts => {
            ts.character_ids.forEach(char_id => {
              character_values.push({
                timestamp_id: ts.timestamp_id,
                character_id: char_id
              });
            })
          })
          this.insertTimestampCharacter(baton, character_values, /*multiple*/ true, callback)
        }
      }

      async.parallel(tasks,
        (err, results) => {
          if (err) {
            t._generateError(baton);
            return
          } else {
            suc_callback()
          }
        });
    }

    verifyParams((updated_params, category_id_num, character_id_num) => {
      this.insertTimestamp(baton, updated_params.timestamps, () => {
        addCharactersAndCategories(updated_params.timestamps, category_id_num, character_id_num, () => {
          baton.json(updated_params)
        })
      })
    })



  },

  post_updateTimestamp(baton, params, res) {
    var t = this;

    function addCharactersAndCategories(params, suc_callback) {
      var tasks = {}
      if (params.category_ids) {
        tasks.categories = function(callback) {
          var category_values = [];
          params.category_ids.forEach(function(category) {
            category_values.push({
              timestamp_id: params.timestamp_id[0],
              category_id: category
            });
          })
          t.insertTimestampCategory(baton, category_values, /*multiple=*/ true, callback)
        }
      }
      if (params.character_ids) {
        tasks.characters = function(callback) {
          var character_values = [];
          params.character_ids.forEach(function(character) {
            character_values.push({
              timestamp_id: params.timestamp_id[0],
              character_id: character
            });
          })
          t.insertTimestampCharacter(baton, character_values, /*multiple*/ true, callback)
        }
      }

      async.parallel(tasks,
        function(err, results) {
          if (err) {
            t._generateError(baton);
            return
          } else {
            suc_callback()
          }
        });
    }

    function removeCharactersAndCategories(params, suc_callback) {
      function createTasks(after_task_created_callback) {
        var tasks = {}
        if (params.category_ids || params.clearCategories) {
          tasks.categories = function(callback) {
            db.removeTimestampCategory(baton, params.timestamp_id, function(data) {
              t._handleDBCall(baton, data, true /*multiple*/ , callback)
            })
          }
        }
        if (params.character_ids || params.clearCharacters) {
          tasks.characters = function(callback) {
            db.removeTimestampCharacter(baton, params.timestamp_id, function(data) {
              t._handleDBCall(baton, data, true /*multiple*/ , callback)
            })
          }
        }
        after_task_created_callback(tasks)
      }

      createTasks(function(tasks) {
        async.parallel(tasks,
          function(err, results) {
            if (err) {
              t._generateError(baton);
              return
            } else {
              suc_callback()
            }
          });
      })
    }

    function ensureCharactersFromSameSeries(characters, timestamp, callback) {
      t.ensure_EpisodeIdExists(baton, {
        episode_id: timestamp.episode_id
      }, function(episode) {
        episode = episode[0]
        t.getAllCharacterData(baton, /*queryParams=*/ {}, function(series_characters) {
          if (t._intersection(characters, series_characters.map(function(character) {
              return character.character_id
            })).length !== characters.length) {
            baton.setError({
              character_ids: params.character_ids,
              series_id: episode.series_id,
              timesamp_id: params.timestamp_id,
              error: "Not all characters in series",
              public_message: 'Invalid characters'
            })
          }
          callback()
        })
      })
    }

    function validateCategoryCharacterValues(params, timestamp_data, suc_callback) {
      function createTasks(after_task_created_callback) {
        var tasks = []
        if (params.category_ids) {
          tasks.push(function(callback) {
            t.ensure_CategoryIdsExist(baton, params.category_ids, function(err) {
              if (err) baton.setError(err)
              callback()
            })
          })
        }

        if (params.character_ids) {
          tasks.push(function(callback) {
            t.ensure_CharacterIdsExist(baton, params.character_ids, function(err) {
              if (err) baton.setError(err)
              callback()
            })
          })
        }
        after_task_created_callback(tasks)
      }

      createTasks(function(tasks) {
        async.parallel(tasks,
          function(err) {
            if (baton.err.length > 0) {
              t._generateError(baton);
            } else {
              suc_callback(params)
            }
          });
      })
    }

    function verifyParams(callback) {
      params.timestamp_id = [params.timestamp_id]
      t.ensure_TimestampIdExists(baton, params, function(timestamp_data) {
        validateCategoryCharacterValues(params, timestamp_data, callback)
      })
    }

    verifyParams(function(params) {
      //IF NEEDED, add check for if the characters are in the series
      removeCharactersAndCategories(params, function() {
        addCharactersAndCategories(params, function() {
          baton.json(params)
        })
      })
    })


  },

  insertTimestampCategory(baton, category_values, multiple, callback) {
    db.insertTimestampCategory(baton, category_values, (data) => {
      this._handleDBCall(baton, data, multiple /*multiple*/ , callback)
    })
  },

  insertTimestampCharacter(baton, character_values, multiple, callback) {
    db.insertTimestampCharacter(baton, character_values, (data) => {
      this._handleDBCall(baton, data, multiple /*multiple*/ , callback)
    })
  },

  //categories is the category ids
  ensure_CategoryIdsExist(baton, categories, callback) {
    var t = this;
    t.getAllCategoryData(baton, /*queryParams=*/ {
      category_id: categories.filter(this._onlyUnique)
    }, (category_data) => {
      if (category_data.filter(cat => categories.includes(cat.category_id)).length !== categories.length) {
        callback({
          category_ids: categories.filter(ct => !category_data.map(cd => cd.category_id).includes(ct)),
          error: "Invalid category ids",
          public_message: 'Invalid categories'
        })
        return
      }
      callback()
    })
  },

  ensure_CharacterIdsExist(baton, characters, callback) {
    var t = this;
    t.getAllCharacterData(baton, /*queryParams=*/ {
      'character_id': characters.filter(this._onlyUnique)
    }, function(character_data) {
      if (character_data.length !== characters.length) {
        callback({
          character_ids: characters.filter(ch => !character_data.map(cd => cd.character_id).includes(ch)),
          error: "Invalid character ids",
          public_message: 'Invalid characters'
        })
        return
      }
      callback()
    })
  },

  ensure_SeriesIdExists(baton, params, callback) {
    var t = this;
    baton.addMethod('ensure_SeriesIdExists');
    this.getAllSeriesData(baton, function(series_data) {
      if (!series_data.map(function(ser) {
          return ser.series_id
        }).includes(params.series_id)) {
        baton.setError({
          series_id: params.series_id,
          error: "Series id not registered",
          public_message: 'Invalid Series Id'
        })
        t._generateError(baton)
        return
      }
      callback()
    })
  },

  //will get params.episode_id and ensure all exist
  ensure_EpisodeIdExists(baton, params, callback) {
    var t = this;
    baton.addMethod('ensure_EpisodeIdExists');
    this.getAllEpisodeData(baton, {
      episode_id: (Array.isArray(params.episode_id) ? params.episode_id : [params.episode_id])
    }, function(episode_data) {
      var numOfEpisodeIds = (Array.isArray(params.episode_id) ? params.episode_id.length : 1)
      if (episode_data.length !== numOfEpisodeIds) {
        baton.setError({
          episode_id: params.episode_id,
          error: "Episode id not registered",
          public_message: 'Invalid Episode Id'
        })
        t._generateError(baton)
        return
      }
      callback(episode_data.filter(function(ep) {
        return ep.episode_id == params.episode_id
      }))
    })
  },

  ensure_TimestampIdExists(baton, params, callback) {
    var t = this;
    baton.addMethod('ensure_TimestampIdExists');
    this.getTimestampData(baton, {
      timestamp_id: params.timestamp_id
    }, function(timestamp_data) {
      if (timestamp_data.length !== params.timestamp_id.length) {
        baton.setError({
          timestamp_id: params.timestamp_id,
          error: "Timestamp id not registered",
          public_message: 'Invalid Timestamp Id'
        })
        t._generateError(baton)
        return
      }
      callback(timestamp_data)
    })
  },

  _stringToArray(str, toInt) {
    if (str == undefined) return [undefined]
    str = str.split(',')
    if (toInt) str.map(function(s) {
      return parseInt(s)
    })
    return str
  },
  /**
   * Handles if error occurs from DB Call
   * in case of multiple, callback will be errorExists,results
   */
  _handleDBCall(baton, data, multiple, callback) {
    //the db is called from an automated source
    if (baton.err.length > 0) {
      //the error would have been set on the DB side
      if (multiple || baton.automated_task_name) {
        callback(true)
        return
      }
      //the error would have been set on the DB side
      this._generateError(baton)
      return
    }
    if (multiple) {
      callback(null, data)
      return
    }
    callback(data)
  },
  /**
   * Creates the 'baton' object holding all general info for the session functions
   * Original Callback will be stored, and method sequence will be stored, along with error
   * uses 'call-by-sharing' ; like call-by-reference, but only for properties of objects
   */
  _getBaton(method, params, res) {
    return baton.createBaton(this._generateId(10), method, params, res)
  },
  _generateId(length, ids) {
    var id = (Math.pow(10, length - 1)) + Math.floor(+Math.random() * 9 * Math.pow(10, (length - 1)));
    if (ids) {
      while (ids.includes(id)) {
        id = (Math.pow(10, length - 1)) + Math.floor(+Math.random() * 9 * Math.pow(10, (length - 1)));
      }
    }
    return id;
  },
  _generateError(baton, errorCode) {
    logger.error(baton.printable())
    baton.sendError({
      'id': baton.id,
      'error_message': baton.err.map(function(err) {
        return err.public_message
      }).join('.')
    }, errorCode);
  },
  /**
   * Returns the intersection of two arrays
   */
  _intersection(a, b) {
    c = [...a.sort()];
    d = [...b.sort()];
    var result = [];
    while (c.length > 0 && d.length > 0) {
      if (c[0] < d[0]) {
        c.shift();
      } else if (c[0] > d[0]) {
        d.shift();
      } else /* they're equal */ {
        result.push(c.shift());
        d.shift();
      }
    }
    return result;
  },

  _onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
  }


}