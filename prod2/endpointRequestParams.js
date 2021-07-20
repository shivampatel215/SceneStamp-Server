var MAIN_VALIDATION = {

  newSeries: {
    series_name: {
      type: 'string'
    }
  },
  getEpisodeData: {
    series_ids: {
      type: "number",
      multiple: true,
      optional: true
    },
    youtube_link: {
      type: 'string',
      optional: true
    },
    nba_game_ids: {
      type: 'string',
      optional: true,
      multiple: true
    },
    nbaBeforeEpochTime: {
      type: 'number',
      optional: true
    },
    nbaAfterEpochTime: {
      type: 'number',
      optional: true
    }
  },
  newEpisode: {
    episode_name: {
      type: "string"
    },
    series_id: {
      type: "number",
      optional: true
    },
    air_date: {
      type: "number",
      optional: true
    },
    youtube_link: {
      type: 'string',
      optional: true
    },
    nba_game_id: {
      type: 'string',
      optional: true
    },
    nba_start_time: {
      type: 'string',
      optional: true
    }
  },
  updateEpisode: {
    episode_id: {
      type: 'number'
    },
    video_offset: {
      type: 'number'
    }
  },
  getCharacterData: {
    character_name: {
      type: "string",
      optional: true
    }
  },
  newCharacter: {
    character_name: {
      type: "string"
    },
    nba_player_id: {
      type: 'number',
      optional: true
    }
  },
  getCategoryData: {
    category_name: {
      type: "string",
      optional: true
    }
  },
  newCategory: {
    category_name: {
      type: 'string'
    }
  },
  getTimestampData: {
    episode_ids: {
      type: "number",
      optional: true,
      multiple: true
    },
    character_ids: {
      type: "number",
      optional: true,
      multiple: true
    },
    category_ids: {
      type: "number",
      optional: true,
      multiple: true
    },
    offset : {
      type: 'number',
      optional: true
    }
  },
  newTimestamp: {
    start_time: {
      type: 'number'
    },
    episode_id: {
      type: 'number'
    },
  },
  massAddTimestamps: {
    timestamps: {
      type: 'mass_timestamp',
      multiple: true
    }
  },
  updateTimestamp: {
    timestamp_id: {
      type: 'number'
    },
    character_ids: {
      type: "number",
      optional: true,
      multiple: true
    },
    category_ids: {
      type: "number",
      optional: true,
      multiple: true
    },
    clearCharacters: {
      type: 'boolean',
      optional: true
    },
    clearCategories: {
      type: 'boolean',
      optional: true
    }
  },
  getCompilationData: {
    timestamp_ids: {
      type: 'number',
      optional: true,
      multiple: true
    },
    compilation_ids: {
      type: 'number',
      optional: true,
      multiple: true
    }
  },
  getCompilationDescription: {
    compilation_id: {
      type: 'number'
    }
  },
  newCompilation: {
    compilation_name: {
      type: 'string'
    },
    timestamps: {
      type: 'compilation_timestamp',
      multiple: true
    }
  },
  createUser: {
    username: {
      type: 'string'
    },
    email: {
      type: 'string'
    },
    password: {
      type: 'string'
    }
  },
  login: {
    username: {
      type: 'string',
      optional: true
    },
    email: {
      type: 'string',
      optional: true
    },
    password: {
      type: 'string'
    }
  },
}

var CUSTOM_OBJECTS = {

  mass_timestamp: {
    start_time: 'number',
    episode_id: 'number',
    category_ids: 'array',
    character_ids: 'array',
  },

  compilation_timestamp: {
    timestamp_id: "number",
    duration: "number",
    start_time: "number",
  }
}

module.exports = {
  MAIN_VALIDATION: MAIN_VALIDATION,
  CUSTOM_OBJECTS: CUSTOM_OBJECTS,
  setCustomObjects(obj) {
    this.CUSTOM_OBJECTS = obj
  },
  resetCustomObjects() {
    this.CUSTOM_OBJECTS = CUSTOM_OBJECTS
  }
}