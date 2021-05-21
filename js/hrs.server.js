HRS.database = null;

HRS.databaseSupport = false;

var HRS = (function (HRS, $, undefined) {
    var _password;

    HRS.setServerPassword = function (password) {
        _password = password;
    };

    HRS.sendOutsideRequest = function (url, data, callback, async) {
        if ($.isFunction(data)) {
            async = callback;
            callback = data;
            data = {};
        } else {
            data = data || {};
        }

        $.support.cors = true;

        $.ajax({
            url: url,
            crossDomain: true,
            dataType: "json",
            type: "GET",
            timeout: 30000,
            async: (async === undefined ? true : async),
            data: data
        }).done(function (json) {
            //why is this necessary??..
            if (json.errorCode && !json.errorDescription) {
                json.errorDescription = (json.errorMessage ? json.errorMessage : $.t("server_error_unknown"));
            }
            if (callback) {
                callback(json, data);
            }
        }).fail(function (xhr, textStatus, error) {
            if (callback) {
                callback({
                    "errorCode": -1,
                    "errorDescription": error
                }, {});
            }
        });
    };

    HRS.sendRequest = function (requestType, data, callback, isAsync) {
        if (requestType == undefined) {
            HRS.logConsole("Undefined request type");
            return;
        }
        if (!HRS.isRequestTypeEnabled(requestType)) {
            callback({
                "errorCode": 1,
                "errorDescription": $.t("request_of_type", {
                    type: requestType
                })
            });
            return;
        }
        if (data == undefined) {
            HRS.logConsole("Undefined data for " + requestType);
            return;
        }
        if (callback == undefined) {
            HRS.logConsole("Undefined callback function for " + requestType);
            return;
        }

        $.each(data, function (key, val) {
            if (key != "secretPhrase") {
                if (typeof val == "string") {
                    data[key] = $.trim(val);
                }
            }
        });
        //convert HBIT to DQT...
        var field = "N/A";
        try {
            var hbitFields = [
                ["feeHBIT", "feeDQT"],
                ["amountHBIT", "amountDQT"],
                ["priceHBIT", "priceDQT"],
                ["refundHBIT", "refundDQT"],
                ["discountHBIT", "discountDQT"],
                ["phasingQuorumHBIT", "phasingQuorum"],
                ["phasingMinBalanceHBIT", "phasingMinBalance"],
                ["controlQuorumHBIT", "controlQuorum"],
                ["controlMinBalanceHBIT", "controlMinBalance"],
                ["controlMaxFeesHBIT", "controlMaxFees"],
                ["minBalanceHBIT", "minBalance"],
                ["shufflingAmountHBIT", "amount"]
            ];

            for (i = 0; i < hbitFields.length; i++) {
                var hbitField = hbitFields[i][0];
                var nqtField = hbitFields[i][1];
                if (hbitField in data) {
                    data[nqtField] = HRS.convertToDQT(data[hbitField]);
                    delete data[hbitField];
                }
            }
        } catch (err) {
            callback({
                "errorCode": 1,
                "errorDescription": err + " (" + $.t(field) + ")"
            });
            return;
        }
        // convert asset/currency decimal amount to base unit
        try {
            var currencyFields = [
                ["phasingQuorumQNTf", "phasingHoldingDecimals"],
                ["phasingMinBalanceQNTf", "phasingHoldingDecimals"],
                ["controlQuorumQNTf", "controlHoldingDecimals"],
                ["controlMinBalanceQNTf", "controlHoldingDecimals"],
                ["minBalanceQNTf", "create_poll_asset_decimals"],
                ["minBalanceQNTf", "create_poll_ms_decimals"],
                ["amountQNTf", "shuffling_asset_decimals"],
                ["amountQNTf", "shuffling_ms_decimals"]
            ];
            var toDelete = [];
            for (i = 0; i < currencyFields.length; i++) {
                var decimalUnitField = currencyFields[i][0];
                var decimalsField = currencyFields[i][1];
                field = decimalUnitField.replace("QNTf", "");

                if (decimalUnitField in data && decimalsField in data) {
                    data[field] = HRS.convertToQNT(parseFloat(data[decimalUnitField]), parseInt(data[decimalsField]));
                    toDelete.push(decimalUnitField);
                    toDelete.push(decimalsField);
                }
            }
            for (var i = 0; i < toDelete.length; i++) {
                delete data[toDelete[i]];
            }
        } catch (err) {
            callback({
                "errorCode": 1,
                "errorDescription": err + " (" + $.t(field) + ")"
            });
            return;
        }

        //Fill phasing parameters when mandatory approval is enabled
        if (requestType != "approveTransaction"
            && HRS.accountInfo.accountControls && $.inArray('PHASING_ONLY', HRS.accountInfo.accountControls) > -1
                && HRS.accountInfo.phasingOnly
                && HRS.accountInfo.phasingOnly.votingModel >= 0) {

            var phasingControl = HRS.accountInfo.phasingOnly;
            var maxFees = new BigInteger(phasingControl.maxFees);
            if (maxFees > 0 && new BigInteger(data.feeDQT).compareTo(new BigInteger(phasingControl.maxFees)) > 0) {
                callback({
                    "errorCode": 1,
                    "errorDescription": $.t("error_fee_exceeds_max_account_control_fee", {
                        "maxFee": HRS.convertToHBIT(phasingControl.maxFees)
                    })
                });
                return;
            }
            var phasingDuration = parseInt(data.phasingFinishHeight) - HRS.lastBlockHeight;
            var minDuration = parseInt(phasingControl.minDuration) > 0 ? parseInt(phasingControl.minDuration) : 0;
            var maxDuration = parseInt(phasingControl.maxDuration) > 0 ? parseInt(phasingControl.maxDuration) : HRS.constants.SERVER.maxPhasingDuration;

            if (phasingDuration < minDuration || phasingDuration > maxDuration) {
                callback({
                    "errorCode": 1,
                    "errorDescription": $.t("error_finish_height_out_of_account_control_interval", {
                        "min": HRS.lastBlockHeight + minDuration,
                        "max": HRS.lastBlockHeight + maxDuration
                    })
                });
                return;
            }

            var phasingParams = HRS.phasingControlObjectToPhasingParams(phasingControl);
            $.extend(data, phasingParams);
            data.phased = true;

            delete data.phasingHashedSecret;
            delete data.phasingHashedSecretAlgorithm;
            delete data.phasingLinkedFullHash;
        }

        if (!data.recipientPublicKey) {
            delete data.recipientPublicKey;
        }
        if (!data.referencedTransactionFullHash) {
            delete data.referencedTransactionFullHash;
        }

        //gets account id from passphrase client side, used only for login.
        var accountId;
        if (requestType == "getAccountId") {
            accountId = HRS.getAccountId(data.secretPhrase);

            var hbitAddress = new HbitAddress();
            var accountRS = "";
            if (hbitAddress.set(accountId)) {
                accountRS = hbitAddress.toString();
            }
            callback({
                "account": accountId,
                "accountRS": accountRS
            });
            return;
        }

        //check to see if secretPhrase supplied matches logged in account, if not - show error.
        if ("secretPhrase" in data) {
            accountId = HRS.getAccountId(HRS.rememberPassword ? _password : data.secretPhrase);
            if (accountId != HRS.account && !data.calculateFee) {
                callback({
                    "errorCode": 1,
                    "errorDescription": $.t("error_passphrase_incorrect")
                });
            } else {
                //ok, accountId matches..continue with the real request.
                HRS.processAjaxRequest(requestType, data, callback, isAsync);
            }
        } else {
            HRS.processAjaxRequest(requestType, data, callback, isAsync);
        }
    };

    HRS.processAjaxRequest = function (requestType, data, callback, isAsync) {
        var extra = null;
        if (data["_extra"]) {
            extra = data["_extra"];
            delete data["_extra"];
        }
        var currentPage = null;
        var currentSubPage = null;

        //means it is a page request, not a global request.. Page requests can be aborted.
        if (requestType.slice(-1) == "+") {
            requestType = requestType.slice(0, -1);
            currentPage = HRS.currentPage;
        } else {
            //not really necessary... we can just use the above code..
            var plusCharacter = requestType.indexOf("+");

            if (plusCharacter > 0) {
                requestType = requestType.substr(0, plusCharacter);
                currentPage = HRS.currentPage;
            }
        }

        if (currentPage && HRS.currentSubPage) {
            currentSubPage = HRS.currentSubPage;
        }

        var type = (HRS.isRequirePost(requestType) || "secretPhrase" in data || "doNotSign" in data || "adminPassword" in data ? "POST" : "GET");
        var url = HRS.server + "/hbit?requestType=" + requestType;

        if (type == "GET") {
            if (typeof data == "string") {
                data += "&random=" + Math.random();
            } else {
                data.random = Math.random();
            }
        }

        if (type == "POST" && HRS.isRequireBlockchain(requestType) && HRS.accountInfo.errorCode && HRS.accountInfo.errorCode == 5) {
            callback({
                "errorCode": 2,
                "errorDescription": $.t("error_new_account")
            }, data);
            return;
        }

        if (data.referencedTransactionFullHash) {
            if (!/^[a-z0-9]{64}$/.test(data.referencedTransactionFullHash)) {
                callback({
                    "errorCode": -1,
                    "errorDescription": $.t("error_invalid_referenced_transaction_hash")
                }, data);
                return;
            }
        }

        var secretPhrase = "";
        if ((!HRS.isLocalHost || data.doNotSign) && type == "POST" && !HRS.isSubmitPassphrase(requestType)) {
            if (HRS.rememberPassword) {
                secretPhrase = _password;
            } else {
                secretPhrase = data.secretPhrase;
            }

            delete data.secretPhrase;

            if (HRS.accountInfo && HRS.accountInfo.publicKey) {
                data.publicKey = HRS.accountInfo.publicKey;
            } else if (!data.doNotSign && secretPhrase) {
                data.publicKey = HRS.generatePublicKey(secretPhrase);
                HRS.accountInfo.publicKey = data.publicKey;
            }
        } else if (type == "POST" && HRS.rememberPassword) {
            data.secretPhrase = _password;
        }

        $.support.cors = true;
        // Used for passing row query string which is too long for a GET request
        if (data.querystring) {
            data = data.querystring;
            type = "POST";
        }
        var contentType;
        var processData;
        var formData = null;
        if (requestType == "uploadTaggedData") {
            // inspired by http://stackoverflow.com/questions/5392344/sending-multipart-formdata-with-jquery-ajax
            contentType = false;
            processData = false;
            formData = new FormData();
            for (var key in data) {
                if (!data.hasOwnProperty(key)) {
                    continue;
                }
                formData.append(key, data[key]);
            }
            var file = $('#upload_file')[0].files[0];
            if (!file) {
                callback({
                    "errorCode": 3,
                    "errorDescription": $.t("error_no_file_chosen")
                }, data);
                return;
            }
            if (file.size > HRS.constants.MAX_TAGGED_DATA_DATA_LENGTH) {
                callback({
                    "errorCode": 3,
                    "errorDescription": $.t("error_file_too_big", {
                        "size": file.size,
                        "allowed": HRS.constants.MAX_TAGGED_DATA_DATA_LENGTH
                    })
                }, data);
                return;
            }
            formData.append("file", file); // file data
            type = "POST";
        } else {
            // JQuery defaults
            contentType = "application/x-www-form-urlencoded; charset=UTF-8";
            processData = true;
        }

        $.ajax({
            url: url,
            crossDomain: true,
            dataType: "json",
            type: type,
            timeout: 30000,
            async: (isAsync === undefined ? true : isAsync),
            currentPage: currentPage,
            currentSubPage: currentSubPage,
            shouldRetry: (type == "GET" ? 2 : undefined),
            traditional: true,
            data: (formData != null ? formData : data),
            contentType: contentType,
            processData: processData
        }).done(function (response) {
            if (HRS.console) {
                HRS.addToConsole(this.url, this.type, this.data, response);
            }
            addAddressData(data);
            if (secretPhrase && response.unsignedTransactionBytes && !data.doNotSign && !response.errorCode && !response.error) {
                var publicKey = HRS.generatePublicKey(secretPhrase);
                var signature = HRS.signBytes(response.unsignedTransactionBytes, converters.stringToHexString(secretPhrase));

                if (!HRS.verifySignature(signature, response.unsignedTransactionBytes, publicKey, callback)) {
                    return;
                }
                addMissingData(data);
                if (file) {
                    var r = new FileReader();
                    r.onload = function (e) {
                        data.filebytes = e.target.result;
                        data.filename = file.name;
                        HRS.verifyAndSignTransactionBytes(response.unsignedTransactionBytes, signature, requestType, data, callback, response, extra);
                    };
                    r.readAsArrayBuffer(file);
                } else {
                    HRS.verifyAndSignTransactionBytes(response.unsignedTransactionBytes, signature, requestType, data, callback, response, extra);
                }
            } else {
                if (response.errorCode || response.errorDescription || response.errorMessage || response.error) {
                    response.errorDescription = HRS.translateServerError(response);
                    delete response.fullHash;
                    if (!response.errorCode) {
                        response.errorCode = -1;
                    }
                    callback(response, data);
                } else {
                    if (response.broadcasted == false && !data.calculateFee) {
                        async.waterfall([
                            function(callback) {
                                addMissingData(data);
                                if (!response.unsignedTransactionBytes) {
                                    callback(null);
                                }
                                if (file) {
                                    var r = new FileReader();
                                    r.onload = function (e) {
                                        data.filebytes = e.target.result;
                                        data.filename = file.name;
                                        callback(null);
                                    };
                                    r.readAsArrayBuffer(file);
                                } else {
                                    callback(null);
                                }
                            },
                            function(callback) {
                                if (response.unsignedTransactionBytes &&
                                    !HRS.verifyTransactionBytes(converters.hexStringToByteArray(response.unsignedTransactionBytes), requestType, data, response.transactionJSON.attachment)) {
                                    callback({
                                        "errorCode": 1,
                                        "errorDescription": $.t("error_bytes_validation_server")
                                    }, data);
                                    return;
                                }
                                callback(null);
                            }
                        ], function() {
                            HRS.showRawTransactionModal(response);
                        });
                    } else {
                        if (extra) {
                            data["_extra"] = extra;
                        }
                        callback(response, data);
                        if (data.referencedTransactionFullHash && !response.errorCode) {
                            $.growl($.t("info_referenced_transaction_hash"), {
                                "type": "info"
                            });
                        }
                    }
                }
            }
        }).fail(function (xhr, textStatus, error) {
            if (HRS.console) {
                HRS.addToConsole(this.url, this.type, this.data, error, true);
            }

            if ((error == "error" || textStatus == "error") && (xhr.status == 404 || xhr.status == 0)) {
                if (type == "POST") {
                    $.growl($.t("error_server_connect"), {
                        "type": "danger",
                        "offset": 10
                    });
                }
            }

            if (error != "abort") {
                if (error == "timeout") {
                    error = $.t("error_request_timeout");
                }
                callback({
                    "errorCode": -1,
                    "errorDescription": error
                }, {});
            }
        });
    };

    HRS.verifyAndSignTransactionBytes = function (transactionBytes, signature, requestType, data, callback, response, extra) {
        var byteArray = converters.hexStringToByteArray(transactionBytes);
        if (!HRS.verifyTransactionBytes(byteArray, requestType, data, response.transactionJSON.attachment)) {
            callback({
                "errorCode": 1,
                "errorDescription": $.t("error_bytes_validation_server")
            }, data);
            return;
        }
        var payload = transactionBytes.substr(0, 192) + signature + transactionBytes.substr(320);
        if (data.broadcast == "false") {
            response.transactionBytes = payload;
            response.transactionJSON.signature = signature;
            HRS.showRawTransactionModal(response);
        } else {
            if (extra) {
                data["_extra"] = extra;
            }
            HRS.broadcastTransactionBytes(payload, callback, response, data);
        }
    };

    HRS.verifyTransactionBytes = function (byteArray, requestType, data, attachment) {
        var transaction = {};
        transaction.type = byteArray[0];
        transaction.version = (byteArray[1] & 0xF0) >> 4;
        transaction.subtype = byteArray[1] & 0x0F;
        transaction.timestamp = String(converters.byteArrayToSignedInt32(byteArray, 2));
        transaction.deadline = String(converters.byteArrayToSignedShort(byteArray, 6));
        transaction.publicKey = converters.byteArrayToHexString(byteArray.slice(8, 40));
        transaction.recipient = String(converters.byteArrayToBigInteger(byteArray, 40));
        transaction.amountDQT = String(converters.byteArrayToBigInteger(byteArray, 48));
        transaction.feeDQT = String(converters.byteArrayToBigInteger(byteArray, 56));

        var refHash = byteArray.slice(64, 96);
        transaction.referencedTransactionFullHash = converters.byteArrayToHexString(refHash);
        if (transaction.referencedTransactionFullHash == "0000000000000000000000000000000000000000000000000000000000000000") {
            transaction.referencedTransactionFullHash = "";
        }
        //transaction.referencedTransactionId = converters.byteArrayToBigInteger([refHash[7], refHash[6], refHash[5], refHash[4], refHash[3], refHash[2], refHash[1], refHash[0]], 0);

        transaction.flags = 0;

        if (transaction.version > 0) {
            transaction.flags = converters.byteArrayToSignedInt32(byteArray, 160);
            transaction.ecBlockHeight = String(converters.byteArrayToSignedInt32(byteArray, 164));
            transaction.ecBlockId = String(converters.byteArrayToBigInteger(byteArray, 168));
        }

        if (transaction.publicKey != HRS.accountInfo.publicKey && transaction.publicKey != data.publicKey) {
            return false;
        }

        if (transaction.deadline !== data.deadline) {
            return false;
        }

        if (transaction.recipient !== data.recipient) {
            if ((data.recipient == HRS.constants.GENESIS || data.recipient == "") && transaction.recipient == "0") {
                //ok
            } else {
                return false;
            }
        }

        if (transaction.amountDQT !== data.amountDQT) {
            return false;
        }

        if ("referencedTransactionFullHash" in data) {
            if (transaction.referencedTransactionFullHash !== data.referencedTransactionFullHash) {
                return false;
            }
        } else if (transaction.referencedTransactionFullHash !== "") {
            return false;
        }
        var pos;
        if (transaction.version > 0) {
            //has empty attachment, so no attachmentVersion byte...
            if (requestType == "sendMoney" || requestType == "sendMessage") {
                pos = 176;
            } else {
                pos = 177;
            }
        } else {
            pos = 160;
        }
        return HRS.verifyTransactionTypes(byteArray, transaction, requestType, data, pos, attachment);
    };

    HRS.verifyTransactionTypes = function (byteArray, transaction, requestType, data, pos, attachment) {
        var length = 0;
        var i=0;
        var serverHash, sha256, utfBytes, isText, hashWords, calculatedHash;
        switch (requestType) {
            case "sendMoney":
                if (transaction.type !== 0 || transaction.subtype !== 0) {
                    return false;
                }
                break;
            case "sendMessage":
                if (transaction.type !== 1 || transaction.subtype !== 0) {
                    return false;
                }
                break;
            case "setAlias":
                if (transaction.type !== 1 || transaction.subtype !== 1) {
                    return false;
                }
                length = parseInt(byteArray[pos], 10);
                pos++;
                transaction.aliasName = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.aliasURI = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                if (transaction.aliasName !== data.aliasName || transaction.aliasURI !== data.aliasURI) {
                    return false;
                }
                break;
            case "createPoll":
                if (transaction.type !== 1 || transaction.subtype !== 2) {
                    return false;
                }
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.name = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.description = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                transaction.finishHeight = converters.byteArrayToSignedInt32(byteArray, pos);
                pos += 4;
                var nr_options = byteArray[pos];
                pos++;

                for (i = 0; i < nr_options; i++) {
                    var optionLength = converters.byteArrayToSignedShort(byteArray, pos);
                    pos += 2;
                    transaction["option" + (i < 10 ? "0" + i : i)] = converters.byteArrayToString(byteArray, pos, optionLength);
                    pos += optionLength;
                }
                transaction.votingModel = String(byteArray[pos]);
                pos++;
                transaction.minNumberOfOptions = String(byteArray[pos]);
                pos++;
                transaction.maxNumberOfOptions = String(byteArray[pos]);
                pos++;
                transaction.minRangeValue = String(byteArray[pos]);
                pos++;
                transaction.maxRangeValue = String(byteArray[pos]);
                pos++;
                transaction.minBalance = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.minBalanceModel = String(byteArray[pos]);
                pos++;
                transaction.holding = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;

                if (transaction.name !== data.name || transaction.description !== data.description ||
                    transaction.minNumberOfOptions !== data.minNumberOfOptions || transaction.maxNumberOfOptions !== data.maxNumberOfOptions) {
                    return false;
                }

                for (i = 0; i < nr_options; i++) {
                    if (transaction["option" + (i < 10 ? "0" + i : i)] !== data["option" + (i < 10 ? "0" + i : i)]) {
                        return false;
                    }
                }

                if (("option" + (i < 10 ? "0" + i : i)) in data) {
                    return false;
                }
                break;
            case "castVote":
                if (transaction.type !== 1 || transaction.subtype !== 3) {
                    return false;
                }
                transaction.poll = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                var voteLength = byteArray[pos];
                pos++;
                transaction.votes = [];

                for (i = 0; i < voteLength; i++) {
                    transaction["vote" + (i < 10 ? "0" + i : i)] = byteArray[pos];
                    pos++;
                }
                if (transaction.poll !== data.poll) {
                    return false;
                }
                break;
            case "hubAnnouncement":
                if (transaction.type !== 1 || transaction.subtype != 4) {
                    return false;
                }
                return false;
                break;
            case "setAccountInfo":
                if (transaction.type !== 1 || transaction.subtype != 5) {
                    return false;
                }
                length = parseInt(byteArray[pos], 10);
                pos++;
                transaction.name = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.description = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                if (transaction.name !== data.name || transaction.description !== data.description) {
                    return false;
                }
                break;
            case "sellAlias":
                if (transaction.type !== 1 || transaction.subtype !== 6) {
                    return false;
                }
                length = parseInt(byteArray[pos], 10);
                pos++;
                transaction.alias = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                transaction.priceDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.alias !== data.aliasName || transaction.priceDQT !== data.priceDQT) {
                    return false;
                }
                break;
            case "buyAlias":
                if (transaction.type !== 1 && transaction.subtype !== 7) {
                    return false;
                }
                length = parseInt(byteArray[pos], 10);
                pos++;
                transaction.alias = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                if (transaction.alias !== data.aliasName) {
                    return false;
                }
                break;
            case "deleteAlias":
                if (transaction.type !== 1 && transaction.subtype !== 8) {
                    return false;
                }
                length = parseInt(byteArray[pos], 10);
                pos++;
                transaction.alias = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                if (transaction.alias !== data.aliasName) {
                    return false;
                }
                break;
            case "approveTransaction":
                if (transaction.type !== 1 && transaction.subtype !== 9) {
                    return false;
                }
                var fullHashesLength = byteArray[pos];
                if (fullHashesLength !== 1) {
                    return false;
                }
                pos++;
                transaction.transactionFullHash = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
                pos += 32;
                if (transaction.transactionFullHash !== data.transactionFullHash) {
                    return false;
                }
                transaction.revealedSecretLength = converters.byteArrayToSignedInt32(byteArray, pos);
                pos += 4;
                if (transaction.revealedSecretLength > 0) {
                    transaction.revealedSecret = converters.byteArrayToHexString(byteArray.slice(pos, pos + transaction.revealedSecretLength));
                    pos += transaction.revealedSecretLength;
                }
                if (transaction.revealedSecret !== data.revealedSecret &&
                    transaction.revealedSecret !== converters.byteArrayToHexString(HRS.getUtf8Bytes(data.revealedSecretText))) {
                    return false;
                }
                break;
            case "setAccountProperty":
                if (transaction.type !== 1 && transaction.subtype !== 10) {
                    return false;
                }
                length = byteArray[pos];
                pos++;
                if (converters.byteArrayToString(byteArray, pos, length) !== data.property) {
                    return false;
                }
                pos += length;
                length = byteArray[pos];
                pos++;
                if (converters.byteArrayToString(byteArray, pos, length) !== data.value) {
                    return false;
                }
                pos += length;
                break;
            case "deleteAccountProperty":
                if (transaction.type !== 1 && transaction.subtype !== 11) {
                    return false;
                }
                // no way to validate the property id, just skip it
                String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                break;
            case "issueAsset":
                if (transaction.type !== 2 || transaction.subtype !== 0) {
                    return false;
                }
                length = byteArray[pos];
                pos++;
                transaction.name = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.description = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                transaction.quantityQNT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.decimals = String(byteArray[pos]);
                pos++;
                if (transaction.name !== data.name || transaction.description !== data.description || transaction.quantityQNT !== data.quantityQNT || transaction.decimals !== data.decimals) {
                    return false;
                }
                break;
            case "transferAsset":
                if (transaction.type !== 2 || transaction.subtype !== 1) {
                    return false;
                }
                transaction.asset = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.quantityQNT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.asset !== data.asset || transaction.quantityQNT !== data.quantityQNT) {
                    return false;
                }
                break;
            case "placeAskOrder":
            case "placeBidOrder":
                if (transaction.type !== 2) {
                    return false;
                } else if (requestType == "placeAskOrder" && transaction.subtype !== 2) {
                    return false;
                } else if (requestType == "placeBidOrder" && transaction.subtype !== 3) {
                    return false;
                }
                transaction.asset = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.quantityQNT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.priceDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.asset !== data.asset || transaction.quantityQNT !== data.quantityQNT || transaction.priceDQT !== data.priceDQT) {
                    return false;
                }
                break;
            case "cancelAskOrder":
            case "cancelBidOrder":
                if (transaction.type !== 2) {
                    return false;
                } else if (requestType == "cancelAskOrder" && transaction.subtype !== 4) {
                    return false;
                } else if (requestType == "cancelBidOrder" && transaction.subtype !== 5) {
                    return false;
                }
                transaction.order = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.order !== data.order) {
                    return false;
                }
                break;
            case "deleteAssetShares":
                if (transaction.type !== 2 || transaction.subtype !== 7) {
                    return false;
                }
                transaction.asset = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.quantityQNT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.asset !== data.asset || transaction.quantityQNT !== data.quantityQNT) {
                    return false;
                }
                break;
            case "dividendPayment":
                if (transaction.type !== 2 || transaction.subtype !== 6) {
                    return false;
                }
                transaction.asset = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.height = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                transaction.amountDQTPerQNT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.asset !== data.asset ||
                    transaction.height !== data.height ||
                    transaction.amountDQTPerQNT !== data.amountDQTPerQNT) {
                    return false;
                }
                break;
            case "dgsListing":
                if (transaction.type !== 3 && transaction.subtype != 0) {
                    return false;
                }
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.name = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.description = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.tags = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                transaction.quantity = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                transaction.priceDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.name !== data.name || transaction.description !== data.description || transaction.tags !== data.tags || transaction.quantity !== data.quantity || transaction.priceDQT !== data.priceDQT) {
                    return false;
                }
                break;
            case "dgsDelisting":
                if (transaction.type !== 3 && transaction.subtype !== 1) {
                    return false;
                }
                transaction.goods = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.goods !== data.goods) {
                    return false;
                }
                break;
            case "dgsPriceChange":
                if (transaction.type !== 3 && transaction.subtype !== 2) {
                    return false;
                }
                transaction.goods = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.priceDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.goods !== data.goods || transaction.priceDQT !== data.priceDQT) {
                    return false;
                }
                break;
            case "dgsQuantityChange":
                if (transaction.type !== 3 && transaction.subtype !== 3) {
                    return false;
                }
                transaction.goods = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.deltaQuantity = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                if (transaction.goods !== data.goods || transaction.deltaQuantity !== data.deltaQuantity) {
                    return false;
                }
                break;
            case "dgsPurchase":
                if (transaction.type !== 3 && transaction.subtype !== 4) {
                    return false;
                }
                transaction.goods = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.quantity = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                transaction.priceDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.deliveryDeadlineTimestamp = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                if (transaction.goods !== data.goods || transaction.quantity !== data.quantity || transaction.priceDQT !== data.priceDQT || transaction.deliveryDeadlineTimestamp !== data.deliveryDeadlineTimestamp) {
                    return false;
                }
                break;
            case "dgsDelivery":
                if (transaction.type !== 3 && transaction.subtype !== 5) {
                    return false;
                }
                transaction.purchase = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                var encryptedGoodsLength = converters.byteArrayToSignedShort(byteArray, pos);
                var goodsLength = converters.byteArrayToSignedInt32(byteArray, pos);
                transaction.goodsIsText = goodsLength < 0; // ugly hack??
                if (goodsLength < 0) {
                    goodsLength &= HRS.constants.MAX_INT_JAVA;
                }
                pos += 4;
                transaction.goodsData = converters.byteArrayToHexString(byteArray.slice(pos, pos + encryptedGoodsLength));
                pos += encryptedGoodsLength;
                transaction.goodsNonce = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
                pos += 32;
                transaction.discountDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                var goodsIsText = (transaction.goodsIsText ? "true" : "false");
                if (goodsIsText != data.goodsIsText) {
                    return false;
                }
                if (transaction.purchase !== data.purchase || transaction.goodsData !== data.goodsData || transaction.goodsNonce !== data.goodsNonce || transaction.discountDQT !== data.discountDQT) {
                    return false;
                }
                break;
            case "dgsFeedback":
                if (transaction.type !== 3 && transaction.subtype !== 6) {
                    return false;
                }
                transaction.purchase = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.purchase !== data.purchase) {
                    return false;
                }
                break;
            case "dgsRefund":
                if (transaction.type !== 3 && transaction.subtype !== 7) {
                    return false;
                }
                transaction.purchase = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.refundDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.purchase !== data.purchase || transaction.refundDQT !== data.refundDQT) {
                    return false;
                }
                break;
            case "leaseBalance":
                if (transaction.type !== 4 && transaction.subtype !== 0) {
                    return false;
                }
                transaction.period = String(converters.byteArrayToSignedShort(byteArray, pos));
                pos += 2;
                if (transaction.period !== data.period) {
                    return false;
                }
                break;
            case "setPhasingOnlyControl":
                if (transaction.type !== 4 && transaction.subtype !== 1) {
                    return false;
                }
                return validateCommonPhasingData(byteArray, pos, data, "control") != -1;
                break;
            case "issueCurrency":
                if (transaction.type !== 5 && transaction.subtype !== 0) {
                    return false;
                }
                length = byteArray[pos];
                pos++;
                transaction.name = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                var codeLength = byteArray[pos];
                pos++;
                transaction.code = converters.byteArrayToString(byteArray, pos, codeLength);
                pos += codeLength;
                length = converters.byteArrayToSignedShort(byteArray, pos);
                pos += 2;
                transaction.description = converters.byteArrayToString(byteArray, pos, length);
                pos += length;
                transaction.type = String(byteArray[pos]);
                pos++;
                transaction.initialSupply = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.reserveSupply = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.maxSupply = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.issuanceHeight = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                transaction.minReservePerUnitDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.minDifficulty = String(byteArray[pos]);
                pos++;
                transaction.maxDifficulty = String(byteArray[pos]);
                pos++;
                transaction.ruleset = String(byteArray[pos]);
                pos++;
                transaction.algorithm = String(byteArray[pos]);
                pos++;
                transaction.decimals = String(byteArray[pos]);
                pos++;
                if (transaction.name !== data.name || transaction.code !== data.code || transaction.description !== data.description ||
                    transaction.type != data.type || transaction.initialSupply !== data.initialSupply || transaction.reserveSupply !== data.reserveSupply ||
                    transaction.maxSupply !== data.maxSupply || transaction.issuanceHeight !== data.issuanceHeight ||
                    transaction.ruleset !== data.ruleset || transaction.algorithm !== data.algorithm || transaction.decimals !== data.decimals) {
                    return false;
                }
                if (transaction.minReservePerUnitDQT !== "0" && transaction.minReservePerUnitDQT !== data.minReservePerUnitDQT) {
                    return false;
                }
                if (transaction.minDifficulty !== "0" && transaction.minDifficulty !== data.minDifficulty) {
                    return false;
                }
                if (transaction.maxDifficulty !== "0" && transaction.maxDifficulty !== data.maxDifficulty) {
                    return false;
                }
                break;
            case "currencyReserveIncrease":
                if (transaction.type !== 5 && transaction.subtype !== 1) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.amountPerUnitDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency || transaction.amountPerUnitDQT !== data.amountPerUnitDQT) {
                    return false;
                }
                break;
            case "currencyReserveClaim":
                if (transaction.type !== 5 && transaction.subtype !== 2) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.units = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency || transaction.units !== data.units) {
                    return false;
                }
                break;
            case "transferCurrency":
                if (transaction.type !== 5 && transaction.subtype !== 3) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.units = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency || transaction.units !== data.units) {
                    return false;
                }
                break;
            case "publishExchangeOffer":
                if (transaction.type !== 5 && transaction.subtype !== 4) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.buyRateDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.sellRateDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.totalBuyLimit = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.totalSellLimit = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.initialBuySupply = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.initialSellSupply = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.expirationHeight = String(converters.byteArrayToSignedInt32(byteArray, pos));
                pos += 4;
                if (transaction.currency !== data.currency || transaction.buyRateDQT !== data.buyRateDQT || transaction.sellRateDQT !== data.sellRateDQT ||
                    transaction.totalBuyLimit !== data.totalBuyLimit || transaction.totalSellLimit !== data.totalSellLimit ||
                    transaction.initialBuySupply !== data.initialBuySupply || transaction.initialSellSupply !== data.initialSellSupply || transaction.expirationHeight !== data.expirationHeight) {
                    return false;
                }
                break;
            case "currencyBuy":
                if (transaction.type !== 5 && transaction.subtype !== 5) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.rateDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.units = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency || transaction.rateDQT !== data.rateDQT || transaction.units !== data.units) {
                    return false;
                }
                break;
            case "currencySell":
                if (transaction.type !== 5 && transaction.subtype !== 6) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.rateDQT = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.units = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency || transaction.rateDQT !== data.rateDQT || transaction.units !== data.units) {
                    return false;
                }
                break;
            case "currencyMint":
                if (transaction.type !== 5 && transaction.subtype !== 7) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.nonce = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.units = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                transaction.counter = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency || transaction.nonce !== data.nonce || transaction.units !== data.units ||
                    transaction.counter !== data.counter) {
                    return false;
                }
                break;
            case "deleteCurrency":
                if (transaction.type !== 5 && transaction.subtype !== 8) {
                    return false;
                }
                transaction.currency = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.currency !== data.currency) {
                    return false;
                }
                break;
            case "uploadTaggedData":
                if (transaction.type !== 6 && transaction.subtype !== 0) {
                    return false;
                }
                serverHash = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
                pos += 32;
                sha256 = CryptoJS.algo.SHA256.create();
                utfBytes = HRS.getUtf8Bytes(data.name);
                sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
                utfBytes = HRS.getUtf8Bytes(data.description);
                sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
                utfBytes = HRS.getUtf8Bytes(data.tags);
                sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
                utfBytes = HRS.getUtf8Bytes(attachment.type);
                sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
                utfBytes = HRS.getUtf8Bytes(data.channel);
                sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
                isText = [];
                if (attachment.isText) {
                    isText.push(1);
                } else {
                    isText.push(0);
                }
                sha256.update(converters.byteArrayToWordArrayEx(isText));
                utfBytes = HRS.getUtf8Bytes(data.filename);
                sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
                var dataBytes = new Int8Array(data.filebytes);
                sha256.update(converters.byteArrayToWordArrayEx(dataBytes));
                hashWords = sha256.finalize();
                calculatedHash = converters.wordArrayToByteArrayEx(hashWords);
                if (serverHash !== converters.byteArrayToHexString(calculatedHash)) {
                    return false;
                }
                break;
            case "extendTaggedData":
                if (transaction.type !== 6 && transaction.subtype !== 1) {
                    return false;
                }
                transaction.taggedDataId = String(converters.byteArrayToBigInteger(byteArray, pos));
                pos += 8;
                if (transaction.taggedDataId !== data.transaction) {
                    return false;
                }
                break;
            case "shufflingCreate":
                if (transaction.type !== 7 && transaction.subtype !== 0) {
                    return false;
                }
                var holding = String(converters.byteArrayToBigInteger(byteArray, pos));
                if (holding !== "0" && holding !== data.holding ||
                    holding === "0" && data.holding !== undefined && data.holding !== "" && data.holding !== "0") {
                    return false;
                }
                pos += 8;
                var holdingType = String(byteArray[pos]);
                if (holdingType !== "0" && holdingType !== data.holdingType ||
                    holdingType === "0" && data.holdingType !== undefined && data.holdingType !== "" && data.holdingType !== "0") {
                    return false;
                }
                pos++;
                var amount = String(converters.byteArrayToBigInteger(byteArray, pos));
                if (amount !== data.amount) {
                    return false;
                }
                pos += 8;
                var participantCount = String(byteArray[pos]);
                if (participantCount !== data.participantCount) {
                    return false;
                }
                pos++;
                var registrationPeriod = converters.byteArrayToSignedShort(byteArray, pos);
                if (registrationPeriod !== data.registrationPeriod) {
                    return false;
                }
                pos += 2;
                break;
            default:
                //invalid requestType..
                return false;
        }

        var position = 1;
        var attachmentVersion;
        //non-encrypted message
        if ((transaction.flags & position) != 0 ||
            ((requestType == "sendMessage" && data.message && !(data.messageIsPrunable === "true")))) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            var messageLength = converters.byteArrayToSignedInt32(byteArray, pos);
            transaction.messageIsText = messageLength < 0; // ugly hack??
            if (messageLength < 0) {
                messageLength &= HRS.constants.MAX_INT_JAVA;
            }
            pos += 4;
            if (transaction.messageIsText) {
                transaction.message = converters.byteArrayToString(byteArray, pos, messageLength);
            } else {
                var slice = byteArray.slice(pos, pos + messageLength);
                transaction.message = converters.byteArrayToHexString(slice);
            }
            pos += messageLength;
            var messageIsText = (transaction.messageIsText ? "true" : "false");
            if (messageIsText != data.messageIsText) {
                return false;
            }
            if (transaction.message !== data.message) {
                return false;
            }
        } else if (data.message && !(data.messageIsPrunable === "true")) {
            return false;
        }

        position <<= 1;

        //encrypted note
        if ((transaction.flags & position) != 0) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            var encryptedMessageLength = converters.byteArrayToSignedInt32(byteArray, pos);
            transaction.messageToEncryptIsText = encryptedMessageLength < 0;
            if (encryptedMessageLength < 0) {
                encryptedMessageLength &= HRS.constants.MAX_INT_JAVA;
            }
            pos += 4;
            transaction.encryptedMessageData = converters.byteArrayToHexString(byteArray.slice(pos, pos + encryptedMessageLength));
            pos += encryptedMessageLength;
            transaction.encryptedMessageNonce = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
            pos += 32;
            var messageToEncryptIsText = (transaction.messageToEncryptIsText ? "true" : "false");
            if (messageToEncryptIsText != data.messageToEncryptIsText) {
                return false;
            }
            if (transaction.encryptedMessageData !== data.encryptedMessageData || transaction.encryptedMessageNonce !== data.encryptedMessageNonce) {
                return false;
            }
        } else if (data.encryptedMessageData && !(data.encryptedMessageIsPrunable === "true")) {
            return false;
        }

        position <<= 1;

        if ((transaction.flags & position) != 0) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            var recipientPublicKey = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
            if (recipientPublicKey != data.recipientPublicKey) {
                return false;
            }
            pos += 32;
        } else if (data.recipientPublicKey) {
            return false;
        }

        position <<= 1;

        if ((transaction.flags & position) != 0) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            var encryptedToSelfMessageLength = converters.byteArrayToSignedInt32(byteArray, pos);
            transaction.messageToEncryptToSelfIsText = encryptedToSelfMessageLength < 0;
            if (encryptedToSelfMessageLength < 0) {
                encryptedToSelfMessageLength &= HRS.constants.MAX_INT_JAVA;
            }
            pos += 4;
            transaction.encryptToSelfMessageData = converters.byteArrayToHexString(byteArray.slice(pos, pos + encryptedToSelfMessageLength));
            pos += encryptedToSelfMessageLength;
            transaction.encryptToSelfMessageNonce = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
            pos += 32;
            var messageToEncryptToSelfIsText = (transaction.messageToEncryptToSelfIsText ? "true" : "false");
            if (messageToEncryptToSelfIsText != data.messageToEncryptToSelfIsText) {
                return false;
            }
            if (transaction.encryptToSelfMessageData !== data.encryptToSelfMessageData || transaction.encryptToSelfMessageNonce !== data.encryptToSelfMessageNonce) {
                return false;
            }
        } else if (data.encryptToSelfMessageData) {
            return false;
        }

        position <<= 1;

        if ((transaction.flags & position) != 0) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            if (String(converters.byteArrayToSignedInt32(byteArray, pos)) !== data.phasingFinishHeight) {
                return false;
            }
            pos += 4;
            pos = validateCommonPhasingData(byteArray, pos, data, "phasing");
            if (pos == -1) {
                return false;
            }
            var linkedFullHashesLength = byteArray[pos];
            pos++;
            for (i = 0; i < linkedFullHashesLength; i++) {
                var fullHash = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
                pos += 32;
                if (fullHash !== data.phasingLinkedFullHash[i]) {
                    return false;
                }
            }
            var hashedSecretLength = byteArray[pos];
            pos++;
            if (hashedSecretLength > 0 && converters.byteArrayToHexString(byteArray.slice(pos, pos + hashedSecretLength)) !== data.phasingHashedSecret) {
                return false;
            }
            pos += hashedSecretLength;
            var algorithm = String(byteArray[pos]);
            if (algorithm !== "0" && algorithm !== data.phasingHashedSecretAlgorithm) {
                return false;
            }
            pos++;
        }

        position <<= 1;

        if ((transaction.flags & position) != 0) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            serverHash = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
            pos += 32;
            sha256 = CryptoJS.algo.SHA256.create();
            isText = [];
            if (data.messageIsText == "true") {
                isText.push(1);
            } else {
                isText.push(0);
            }
            sha256.update(converters.byteArrayToWordArrayEx(isText));
            utfBytes = HRS.getUtf8Bytes(data.message);
            sha256.update(converters.byteArrayToWordArrayEx(utfBytes));
            hashWords = sha256.finalize();
            calculatedHash = converters.wordArrayToByteArrayEx(hashWords);
            if (serverHash !== converters.byteArrayToHexString(calculatedHash)) {
                return false;
            }
        }
        position <<= 1;

        if ((transaction.flags & position) != 0) {
            attachmentVersion = byteArray[pos];
            if (attachmentVersion < 0 || attachmentVersion > 2) {
                return false;
            }
            pos++;
            serverHash = converters.byteArrayToHexString(byteArray.slice(pos, pos + 32));
            sha256 = CryptoJS.algo.SHA256.create();
            if (data.messageToEncryptIsText == "true") {
                sha256.update(converters.byteArrayToWordArrayEx([1]));
            } else {
                sha256.update(converters.byteArrayToWordArrayEx([0]));
            }
            sha256.update(converters.byteArrayToWordArrayEx([1])); // compression
            sha256.update(converters.byteArrayToWordArrayEx(converters.hexStringToByteArray(data.encryptedMessageData)));
            sha256.update(converters.byteArrayToWordArrayEx(converters.hexStringToByteArray(data.encryptedMessageNonce)));
            hashWords = sha256.finalize();
            calculatedHash = converters.wordArrayToByteArrayEx(hashWords);
            if (serverHash !== converters.byteArrayToHexString(calculatedHash)) {
                return false;
            }
        }

        return true;
    };

    HRS.broadcastTransactionBytes = function (transactionData, callback, originalResponse, originalData) {
        $.ajax({
            url: HRS.server + "/hbit?requestType=broadcastTransaction",
            crossDomain: true,
            dataType: "json",
            type: "POST",
            timeout: 30000,
            async: true,
            data: {
                "transactionBytes": transactionData,
                "prunableAttachmentJSON": JSON.stringify(originalResponse.transactionJSON.attachment)
            }
        }).done(function (response) {
            if (HRS.console) {
                HRS.addToConsole(this.url, this.type, this.data, response);
            }

            if (response.errorCode) {
                if (!response.errorDescription) {
                    response.errorDescription = (response.errorMessage ? response.errorMessage : "Unknown error occurred.");
                }
                callback(response, originalData);
            } else if (response.error) {
                response.errorCode = 1;
                response.errorDescription = response.error;
                callback(response, originalData);
            } else {
                if ("transactionBytes" in originalResponse) {
                    delete originalResponse.transactionBytes;
                }
                originalResponse.broadcasted = true;
                originalResponse.transaction = response.transaction;
                originalResponse.fullHash = response.fullHash;
                callback(originalResponse, originalData);
                if (originalData.referencedTransactionFullHash) {
                    $.growl($.t("info_referenced_transaction_hash"), {
                        "type": "info"
                    });
                }
            }
        }).fail(function (xhr, textStatus, error) {
            if (HRS.console) {
                HRS.addToConsole(this.url, this.type, this.data, error, true);
            }

            if (error == "timeout") {
                error = $.t("error_request_timeout");
            }
            callback({
                "errorCode": -1,
                "errorDescription": error
            }, {});
        });
    };
    
    HRS.sendRequestQRCode = function(target, qrCodeData, width, height) {
        width = width || 0;
        height = height || 0;
        HRS.sendRequest("encodeQRCode",
            {
                "qrCodeData": qrCodeData,
                "width": width,
                "height": height
            },
            function(response) {
                if('qrCodeBase64' in response) {
                    $(target).empty().append(
                        $("<img src='data:image/jpeg;base64,"+response.qrCodeBase64+"'>")
                    );
                }
            },
            true
        );
    };

    function addAddressData(data) {
        if (typeof data == "object" && ("recipient" in data)) {
            var address = new HbitAddress();
            if (/^HBIT\-/i.test(data.recipient)) {
                data.recipientRS = data.recipient;
                if (address.set(data.recipient)) {
                    data.recipient = address.account_id();
                }
            } else {
                if (address.set(data.recipient)) {
                    data.recipientRS = address.toString();
                }
            }
        }
    }

    function addMissingData(data) {
        if (!("amountDQT" in data)) {
            data.amountDQT = "0";
        }
        if (!("recipient" in data)) {
            data.recipient = HRS.constants.GENESIS;
            data.recipientRS = HRS.constants.GENESIS_RS;
        }
    }

    function validateCommonPhasingData (byteArray, pos, data, prefix) {
        if (byteArray[pos] != (parseInt(data[prefix + "VotingModel"]) & 0xFF)) {
            return -1;
        }
        pos++;
        if (String(converters.byteArrayToBigInteger(byteArray, pos)) !== String(data[prefix + "Quorum"])) {
            return -1;
        }
        pos += 8;
        var minBalance = String(converters.byteArrayToBigInteger(byteArray, pos));
        if (minBalance !== "0" && minBalance !== data[prefix + "MinBalance"]) {
            return -1;
        }
        pos += 8;
        var whiteListLength = byteArray[pos];
        pos++;
        for (i = 0; i < whiteListLength; i++) {
            var accountId = converters.byteArrayToBigInteger(byteArray, pos);
            var accountRS = HRS.convertNumericToRSAccountFormat(accountId);
            pos += 8;
            if (String(accountId) !== data[prefix + "Whitelisted"][i] && String(accountRS) !== data[prefix + "Whitelisted"][i]) {
                return -1;
            }
        }
        var holdingId = String(converters.byteArrayToBigInteger(byteArray, pos));
        if (holdingId !== "0" && holdingId !== data[prefix + "Holding"]) {
            return -1;
        }
        pos += 8;
        if (String(byteArray[pos]) !== String(data[prefix + "MinBalanceModel"])) {
            return -1;
        }
        pos++;
        return pos;
    }

    return HRS;
}(HRS || {}, jQuery));