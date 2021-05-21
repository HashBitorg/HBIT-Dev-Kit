/**
 * @depends {hrs.js}
 */
var HRS = (function (HRS, $) {
    HRS.constants = {
        'DB_VERSION': 2,

        'PLUGIN_VERSION': 1,
        'MAX_SHORT_JAVA': 32767,
        'MAX_UNSIGNED_SHORT_JAVA': 65535,
        'MAX_INT_JAVA': 2147483647,
        'MIN_PRUNABLE_MESSAGE_LENGTH': 28,
        'DISABLED_API_ERROR_CODE': 16,

        //Plugin launch status numbers
        'PL_RUNNING': 1,
        'PL_PAUSED': 2,
        'PL_DEACTIVATED': 3,
        'PL_HALTED': 4,

        //Plugin validity status codes
        'PV_VALID': 100,
        'PV_NOT_VALID': 300,
        'PV_UNKNOWN_MANIFEST_VERSION': 301,
        'PV_INCOMPATIBLE_MANIFEST_VERSION': 302,
        'PV_INVALID_MANIFEST_FILE': 303,
        'PV_INVALID_MISSING_FILES': 304,
        'PV_INVALID_JAVASCRIPT_FILE': 305,

        //Plugin HRS compatibility status codes
        'PNC_COMPATIBLE': 100,
        'PNC_COMPATIBILITY_MINOR_RELEASE_DIFF': 101,
        'PNC_COMPATIBILITY_WARNING': 200,
        'PNC_COMPATIBILITY_MAJOR_RELEASE_DIFF': 202,
        'PNC_NOT_COMPATIBLE': 300,
        'PNC_COMPATIBILITY_UNKNOWN': 301,
        'PNC_COMPATIBILITY_CLIENT_VERSION_TOO_OLD': 302,

        'VOTING_MODELS': {},
        'MIN_BALANCE_MODELS': {},
        "HASH_ALGORITHMS": {},
        "PHASING_HASH_ALGORITHMS": {},
        "MINTING_HASH_ALGORITHMS": {},
        "REQUEST_TYPES": {},
        "API_TAGS": {},

        'SERVER': {},
        'MAX_TAGGED_DATA_DATA_LENGTH': 0,
        'GENESIS': '',
        'GENESIS_RS': '',
        'EPOCH_BEGINNING': 1619179200000,
        'FORGING': 'forging',
        'NOT_FORGING': 'not_forging',
        'UNKNOWN': 'unknown'
    };

    HRS.loadAlgorithmList = function (algorithmSelect, isPhasingHash) {
        var hashAlgorithms;
        if (isPhasingHash) {
            hashAlgorithms = HRS.constants.PHASING_HASH_ALGORITHMS;
        } else {
            hashAlgorithms = HRS.constants.HASH_ALGORITHMS;
        }
        for (var key in hashAlgorithms) {
            if (hashAlgorithms.hasOwnProperty(key)) {
                algorithmSelect.append($("<option />").val(hashAlgorithms[key]).text(key));
            }
        }
    };

    HRS.loadServerConstants = function () {
        HRS.sendRequest("getConstants", {}, function (response) {
            if (response.genesisAccountId) {
                HRS.constants.SERVER = response;
                HRS.constants.VOTING_MODELS = response.votingModels;
                HRS.constants.MIN_BALANCE_MODELS = response.minBalanceModels;
                HRS.constants.HASH_ALGORITHMS = response.hashAlgorithms;
                HRS.constants.PHASING_HASH_ALGORITHMS = response.phasingHashAlgorithms;
                HRS.constants.MINTING_HASH_ALGORITHMS = response.mintingHashAlgorithms;
                HRS.constants.MAX_TAGGED_DATA_DATA_LENGTH = response.maxTaggedDataDataLength;
                HRS.constants.GENESIS = response.genesisAccountId;
                HRS.constants.GENESIS_RS = HRS.convertNumericToRSAccountFormat(response.genesisAccountId);
                HRS.constants.EPOCH_BEGINNING = response.epochBeginning;
                HRS.constants.REQUEST_TYPES = response.requestTypes;
                HRS.constants.API_TAGS = response.apiTags;
                HRS.constants.SHUFFLING_STAGES = response.shufflingStages;
                HRS.constants.SHUFFLING_PARTICIPANTS_STATES = response.shufflingParticipantStates;
                HRS.constants.DISABLED_APIS = response.disabledAPIs;
                HRS.constants.DISABLED_API_TAGS = response.disabledAPITags;
                HRS.loadTransactionTypeConstants(response);
            }
        }, false);
    };

    function getKeyByValue(map, value) {
        for (var key in map) {
            if (map.hasOwnProperty(key)) {
                if (value === map[key]) {
                    return key;
                }
            }
        }
        return null;
    }

    HRS.getVotingModelName = function (code) {
        return getKeyByValue(HRS.constants.VOTING_MODELS, code);
    };

    HRS.getVotingModelCode = function (name) {
        return HRS.constants.VOTING_MODELS[name];
    };

    HRS.getMinBalanceModelName = function (code) {
        return getKeyByValue(HRS.constants.MIN_BALANCE_MODELS, code);
    };

    HRS.getMinBalanceModelCode = function (name) {
        return HRS.constants.MIN_BALANCE_MODELS[name];
    };

    HRS.getHashAlgorithm = function (code) {
        return getKeyByValue(HRS.constants.HASH_ALGORITHMS, code);
    };

    HRS.getShufflingStage = function (code) {
        return getKeyByValue(HRS.constants.SHUFFLING_STAGES, code);
    };

    HRS.getShufflingParticipantState = function (code) {
        return getKeyByValue(HRS.constants.SHUFFLING_PARTICIPANTS_STATES, code);
    };

    HRS.isRequireBlockchain = function(requestType) {
        if (!HRS.constants.REQUEST_TYPES[requestType]) {
            // For requests invoked before the getConstants request returns,
            // we implicitly assume that they do not require the blockchain
            return false;
        }
        return true == HRS.constants.REQUEST_TYPES[requestType].requireBlockchain;
    };

    HRS.isRequirePost = function(requestType) {
        if (!HRS.constants.REQUEST_TYPES[requestType]) {
            // For requests invoked before the getConstants request returns
            // we implicitly assume that they can use GET
            return false;
        }
        return true == HRS.constants.REQUEST_TYPES[requestType].requirePost;
    };

    HRS.isRequestTypeEnabled = function(requestType) {
        if ($.isEmptyObject(HRS.constants.REQUEST_TYPES)) {
            return true;
        }
        if (requestType.indexOf("+") > 0) {
            requestType = requestType.substring(0, requestType.indexOf("+"));
        }
        return !!HRS.constants.REQUEST_TYPES[requestType];
    };

    HRS.isSubmitPassphrase = function (requestType) {
        return requestType == "startForging" ||
            requestType == "stopForging" ||
            requestType == "startShuffler" ||
            requestType == "getForging" ||
            requestType == "markHost";
    };

    HRS.isApiEnabled = function(depends) {
        if (!depends) {
            return true;
        }
        var tags = depends.tags;
        if (tags) {
            for (var i=0; i < tags.length; i++) {
                if (!tags[i].enabled) {
                    return false;
                }
            }
        }
        var apis = depends.apis;
        if (apis) {
            for (i=0; i < apis.length; i++) {
                if (!apis[i].enabled) {
                    return false;
                }
            }
        }
        return true;
    };

    return HRS;
}(HRS || {}, jQuery));