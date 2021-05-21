# HBIT DevKit for Javascript
Javascript development framework for HBIT. Create transactions with Javascript, get the most used HBIT functions. 

# Why?

The HBIT DevKit was developed by HBIT developers to work with the HBIT API and JavaScript in the HBIT Wallet.
Setup the server in hrs.js (default official node), any transaction that will go through the wrapper will be signed with Javascript and then submitted to the HBIT API.

No passphrase will leave your JavaScript, check HRS.sendRequest

# Installation

### Public Node

Find a public node with open API and cors enabled on 

https://chain.hashbit.org

Insert this into server variable of js/hrs.js

### Localhost

Please install HBIT locally and open cors in the configuration as explained here:

	# Enable Cross Origin Filter for the API server.
	hbit.apiServerCORS=true
	​
	# Enable Cross Origin Filter for HRS user interface server.
	hbit.uiServerCORS=true

restart HBIT


## HBIT Api

When HBIT is running go to: 

https://node.hashbit.org/test

HBIT API documentation:

https://chain.hashbit.org/

# Use HRS functions

use HRS functions, to submit HBIT requests, calculate from Assets, DQT, Currencies, Votes and more.
Use the HBIT Data Cloud, Marketplace, Alias System, see more on 

## Examples

	 HRS.sendRequest("getBlockchainStatus", {
					
	}, function(response, input) {
		if (!response.errorCode) {
			console.log(response);
			console.log(input);

			$("#blockchainStatus").html('Current Block: '+response.numberOfBlocks+' - Current HBIT Time '+response.time);

		} else {
			console.log('Could not connect to HBIT. Please enable cors');
		}
	});

# Benefits

Using the HRS.sendRequest will be a secure wrapper for your HBIT transactions. When you POST a transaction with passphrase, it will

1) create the transaction with JavaScript

2) Sign the transaction with passphrase

3) broadcast transaction to local/public HBIT API

# Documentation

## Variables

//Modify js/hrs.js to set your HBIT Node

HRS.server = "https://node.hashbit.org";

HRS.database = null;

HRS.databaseSupport = false; 


## Functions 

Use HRS functions, so you have not to write your own for:

"hrs.sever.js"

HRS.setServerPassword = function (password)

HRS.sendOutsideRequest = function (url, data, callback, async)

HRS.sendRequest = function (requestType, data, callback, isAsync)

HRS.processAjaxRequest = function (requestType, data, callback, isAsync)

HRS.verifyAndSignTransactionBytes = function (transactionBytes, signature, requestType, data, callback, response, extra)

HRS.verifyTransactionBytes = function (byteArray, requestType, data, attachment)

HRS.verifyTransactionTypes = function (byteArray, transaction, requestType, data, pos, attachment)

HRS.broadcastTransactionBytes = function (transactionData, callback, originalResponse, originalData)

"hrs.util.js"

HRS.formatVolume = function (volume)

HRS.formatWeight = function (weight)

HRS.formatOrderPricePerWholeQNT = function (price, decimals)

HRS.calculateOrderPricePerWholeQNT = function (price, decimals, returnAsObject)

HRS.calculatePricePerWholeQNT = function (price, decimals)

function calculateOrderTotalImpl (quantityQNT, priceDQT)

HRS.calculateOrderTotalDQT = function (quantityQNT, priceDQT)

HRS.calculateOrderTotal = function (quantityQNT, priceDQT)

HRS.calculatePercentage = function (a, b, rounding_mode)

HRS.convertToHBIT = function (amount, returnAsObject)

HRS.amountToPrecision = function (amount, decimals)

HRS.convertToDQT = function (currency)

HRS.convertToQNTf = function (quantity, decimals, returnAsObject) 

HRS.convertToQNT = function (quantity, decimals)

HRS.format = function (params, no_escaping)

HRS.formatQuantity = function (quantity, decimals, no_escaping)

HRS.formatAmount = function (amount, round, no_escaping)

HRS.fromEpochTime = function (epochTime)

HRS.toEpochTime = function (currentTime)

HRS.formatTimestamp = function (timestamp, date_only, isAbsoluteTime) 

HRS.isPrivateIP = function (ip)

HRS.convertToHex16 = function (str)

HRS.convertFromHex16 = function (hex)

HRS.convertFromHex8 = function (hex)

HRS.convertToHex8 = function (str)

HRS.getFormData = function ($form, unmodified)

HRS.mergeMaps = function (mergedMap, toMap, skipAttributes) 

HRS.convertNumericToRSAccountFormat = function (account)

HRS.getAccountTitle = function (object, acc)

HRS.formatStyledAmount = function (strAmount, round)

HRS.getUnconfirmedTransactionsFromCache = function (type, subtype, fields, single)

HRS.completeUnconfirmedTransactionDetails = function (unconfirmedTransaction)

HRS.hasTransactionUpdates = function (transactions)

HRS.setCookie = function (name, value, days)

HRS.getCookie = function (name)

HRS.deleteCookie = function (name)

HRS.validateDecimals = function (maxFractionLength, charCode, val, e) 

HRS.getUrlParameter = function (sParam)

HRS.getUtf8Bytes = function (str)

HRS.getTransactionStatusIcon = function (phasedEntity)

HRS.phasingControlObjectToPhasingParams = function(controlObj)

HRS.strToUTF8Arr = function(str)

function byteArrayToBigInteger(byteArray)

HRS.generateToken = function(message, secretPhrase)


