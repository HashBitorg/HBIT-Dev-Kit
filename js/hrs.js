var HRS = (function(HRS, $, undefined) {
	"use strict";

	//Modify to set your HBIT Node
	HRS.server = "https://node.hashbit.org";
	HRS.state = {};
	HRS.blocks = [];
	HRS.account = "";
	HRS.accountRS = "";
	HRS.publicKey = "";
	HRS.accountInfo = {};

	HRS.database = null;
	HRS.databaseSupport = false;
	HRS.databaseFirstStart = false;

	// Legacy database, don't use this for data storage
	HRS.legacyDatabase = null;
	HRS.legacyDatabaseWithData = false;

	HRS.serverConnect = false;
	HRS.peerConnect = false;

	HRS.settings = {};
	HRS.contacts = {};

	HRS.isTestNet = false;
	HRS.isLocalHost = false;
	HRS.forgingStatus = HRS.constants.UNKNOWN;
	HRS.isAccountForging = false;
	HRS.isLeased = false;
	HRS.needsAdminPassword = true;
    HRS.upnpExternalAddress = null;

	HRS.lastBlockHeight = 0;
	HRS.downloadingBlockchain = false;

	HRS.rememberPassword = false;
	HRS.selectedContext = null;

	HRS.currentPage = "dashboard";
	HRS.currentSubPage = "";
	HRS.pageNumber = 1;

	HRS.pages = {};
	HRS.incoming = {};
	HRS.setup = {};

    HRS.hasLocalStorage = _checkDOMenabled();
	HRS.appVersion = "";
	HRS.appPlatform = "";
	HRS.assetTableKeys = [];

	var stateInterval;
	var stateIntervalSeconds = 30;
	var isScanning = false;

	HRS.init = function() {
		HRS.sendRequest("getState", {
			"includeCounts": "false"
		}, function (response) {
			var isTestnet = false;
			var isOffline = false;
			var peerPort = 0;
			for (var key in response) {
                if (!response.hasOwnProperty(key)) {
                    continue;
                }
				if (key == "isTestnet") {
					isTestnet = response[key];
				}
				if (key == "isOffline") {
					isOffline = response[key];
				}
				if (key == "peerPort") {
					peerPort = response[key];
				}
				if (key == "needsAdminPassword") {
					HRS.needsAdminPassword = response[key];
				}
				if (key == "upnpExternalAddress") {
                    HRS.upnpExternalAddress = response[key];
				}
			}

			if (!isTestnet) {
				$(".testnet_only").hide();
			} else {
				HRS.isTestNet = true;
				var testnetWarningDiv = $("#testnet_warning");
				var warningText = testnetWarningDiv.text() + " The testnet peer port is " + peerPort + (isOffline ? ", the peer is working offline." : ".");
                HRS.logConsole(warningText);
				testnetWarningDiv.text(warningText);
				$(".testnet_only, #testnet_login, #testnet_warning").show();
			}
			HRS.loadServerConstants();
			HRS.initializePlugins();
            HRS.printEnvInfo();
		});

		if (!HRS.server) {
			var hostName = window.location.hostname.toLowerCase();
			HRS.isLocalHost = hostName == "localhost" || hostName == "127.0.0.1" || HRS.isPrivateIP(hostName);
            HRS.logProperty("HRS.isLocalHost");
		}

		if (!HRS.isLocalHost) {
			$(".remote_warning").show();
		}

		try {
			//noinspection BadExpressionStatementJS
            window.localStorage;
		} catch (err) {
			HRS.hasLocalStorage = false;
		}
		if(!(navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1)) {
			// Not Safari
			// Don't use account based DB in Safari due to a buggy indexedDB implementation (2015-02-24)
			HRS.createLegacyDatabase();
		}

		if (HRS.getCookie("remember_passphrase")) {
			$("#remember_password").prop("checked", true);
		}

		HRS.getSettings();

		HRS.getState(function() {
			setTimeout(function() {
				HRS.checkAliasVersions();
			}, 5000);
		});

		$("body").popover({
			"selector": ".show_popover",
			"html": true,
			"trigger": "hover"
		});

		HRS.showLockscreen();
		HRS.setStateInterval(30);

		if (!HRS.isTestNet) {
			setInterval(HRS.checkAliasVersions, 1000 * 60 * 60);
		}

		HRS.allowLoginViaEnter();
		HRS.automaticallyCheckRecipient();

		$("#dashboard_table, #transactions_table").on("mouseenter", "td.confirmations", function() {
			$(this).popover("show");
		}).on("mouseleave", "td.confirmations", function() {
			$(this).popover("destroy");
			$(".popover").remove();
		});

		_fix();

		$(window).on("resize", function() {
			_fix();

			if (HRS.currentPage == "asset_exchange") {
				HRS.positionAssetSidebar();
			}
		});
		// Enable all static tooltip components
		// tooltip components generated dynamically (for tables cells for example)
		// has to be enabled by activating this code on the specific widget
		$("[data-toggle='tooltip']").tooltip();

		$("#dgs_search_account_center").mask("HBIT-****-****-****-*****");

		if (HRS.getUrlParameter("account")){
			HRS.login(false,HRS.getUrlParameter("account"));
		}
	};

	function _fix() {
		var height = $(window).height() - $("body > .header").height();
		var content = $(".wrapper").height();

		$(".content.content-stretch:visible").width($(".page:visible").width());
		if (content > height) {
			$(".left-side, html, body").css("min-height", content + "px");
		} else {
			$(".left-side, html, body").css("min-height", height + "px");
		}
	}

	HRS.setStateInterval = function(seconds) {
		if (seconds == stateIntervalSeconds && stateInterval) {
			return;
		}
		if (stateInterval) {
			clearInterval(stateInterval);
		}
		stateIntervalSeconds = seconds;
		stateInterval = setInterval(function() {
			HRS.getState();
			HRS.updateForgingStatus();
		}, 1000 * seconds);
	};

	var _firstTimeAfterLoginRun = false;

	HRS.getState = function(callback) {
		HRS.sendRequest("getBlockchainStatus", {}, function(response) {
			if (response.errorCode) {
				HRS.serverConnect = false;
                $.growl($.t("server_connection_error") + " " + response.errorDescription);
			} else {
				var firstTime = !("lastBlock" in HRS.state);
				var previousLastBlock = (firstTime ? "0" : HRS.state.lastBlock);

				HRS.state = response;
				HRS.serverConnect = true;

				if (firstTime) {
					$("#hrs_version").html(HRS.state.version).removeClass("loading_dots");
					HRS.getBlock(HRS.state.lastBlock, HRS.handleInitialBlocks);
				} else if (HRS.state.isScanning) {
					//do nothing but reset HRS.state so that when isScanning is done, everything is reset.
					isScanning = true;
				} else if (isScanning) {
					//rescan is done, now we must reset everything...
					isScanning = false;
					HRS.blocks = [];
					HRS.tempBlocks = [];
					HRS.getBlock(HRS.state.lastBlock, HRS.handleInitialBlocks);
					if (HRS.account) {
						HRS.getInitialTransactions();
						HRS.getAccountInfo();
					}
				} else if (previousLastBlock != HRS.state.lastBlock) {
					HRS.tempBlocks = [];
					if (HRS.account) {
						HRS.getAccountInfo();
					}
					HRS.getBlock(HRS.state.lastBlock, HRS.handleNewBlocks);
					if (HRS.account) {
						HRS.getNewTransactions();
						HRS.updateApprovalRequests();
					}
				} else {
					if (HRS.account) {
						HRS.getUnconfirmedTransactions(function(unconfirmedTransactions) {
							HRS.handleIncomingTransactions(unconfirmedTransactions, false);
						});
					}
				}
				if (HRS.account && !_firstTimeAfterLoginRun) {
					//Executed ~30 secs after login, can be used for tasks needing this condition state
					_firstTimeAfterLoginRun = true;
				}

				if (callback) {
					callback();
				}
			}
			/* Checks if the client is connected to active peers */
			HRS.checkConnected();
			//only done so that download progress meter updates correctly based on lastFeederHeight
			if (HRS.downloadingBlockchain) {
				HRS.updateBlockchainDownloadProgress();
			}
		});
	};

	$("#logo, .sidebar-menu").on("click", "a", function(e, data) {
		if ($(this).hasClass("ignore")) {
			$(this).removeClass("ignore");
			return;
		}

		e.preventDefault();

		if ($(this).data("toggle") == "modal") {
			return;
		}

		var page = $(this).data("page");

		if (page == HRS.currentPage) {
			if (data && data.callback) {
				data.callback();
			}
			return;
		}

		$(".page").hide();

		$(document.documentElement).scrollTop(0);

		$("#" + page + "_page").show();

		$(".content-header h1").find(".loading_dots").remove();

        var $newActiveA;
        if ($(this).attr("id") && $(this).attr("id") == "logo") {
            $newActiveA = $("#dashboard_link").find("a");
		} else {
			$newActiveA = $(this);
		}
		var $newActivePageLi = $newActiveA.closest("li.treeview");

		$("ul.sidebar-menu > li.active").each(function(key, elem) {
			if ($newActivePageLi.attr("id") != $(elem).attr("id")) {
				$(elem).children("a").first().addClass("ignore").click();
			}
		});

		$("ul.sidebar-menu > li.sm_simple").removeClass("active");
		if ($newActiveA.parent("li").hasClass("sm_simple")) {
			$newActiveA.parent("li").addClass("active");
		}

		$("ul.sidebar-menu li.sm_treeview_submenu").removeClass("active");
		if($(this).parent("li").hasClass("sm_treeview_submenu")) {
			$(this).closest("li").addClass("active");
		}

		if (HRS.currentPage != "messages") {
			$("#inline_message_password").val("");
		}

		//HRS.previousPage = HRS.currentPage;
		HRS.currentPage = page;
		HRS.currentSubPage = "";
		HRS.pageNumber = 1;
		HRS.showPageNumbers = false;

		if (HRS.pages[page]) {
			HRS.pageLoading();
			HRS.resetNotificationState(page);
            var callback;
            if (data) {
				if (data.callback) {
					callback = data.callback;
				} else {
					callback = data;
				}
			} else {
				callback = undefined;
			}
            var subpage;
            if (data && data.subpage) {
                subpage = data.subpage;
			} else {
				subpage = undefined;
			}
			HRS.pages[page](callback, subpage);
		}
	});

	$("button.goto-page, a.goto-page").click(function(event) {
		event.preventDefault();
		HRS.goToPage($(this).data("page"), undefined, $(this).data("subpage"));
	});

	HRS.loadPage = function(page, callback, subpage) {
		HRS.pageLoading();
		HRS.pages[page](callback, subpage);
	};

	HRS.goToPage = function(page, callback, subpage) {
		var $link = $("ul.sidebar-menu a[data-page=" + page + "]");

		if ($link.length > 1) {
			if ($link.last().is(":visible")) {
				$link = $link.last();
			} else {
				$link = $link.first();
			}
		}

		if ($link.length == 1) {
			$link.trigger("click", [{
				"callback": callback,
				"subpage": subpage
			}]);
			HRS.resetNotificationState(page);
		} else {
			HRS.currentPage = page;
			HRS.currentSubPage = "";
			HRS.pageNumber = 1;
			HRS.showPageNumbers = false;

			$("ul.sidebar-menu a.active").removeClass("active");
			$(".page").hide();
			$("#" + page + "_page").show();
			if (HRS.pages[page]) {
				HRS.pageLoading();
				HRS.resetNotificationState(page);
				HRS.pages[page](callback, subpage);
			}
		}
	};

	HRS.pageLoading = function() {
		HRS.hasMorePages = false;

		var $pageHeader = $("#" + HRS.currentPage + "_page .content-header h1");
		$pageHeader.find(".loading_dots").remove();
		$pageHeader.append("<span class='loading_dots'><span>.</span><span>.</span><span>.</span></span>");
	};

	HRS.pageLoaded = function(callback) {
		var $currentPage = $("#" + HRS.currentPage + "_page");

		$currentPage.find(".content-header h1 .loading_dots").remove();

		if ($currentPage.hasClass("paginated")) {
			HRS.addPagination();
		}

		if (callback) {
			try {
                callback();
            } catch(e) { /* ignore since sometimes callback is not a function */ }
		}
	};

HRS.addPagination = function () {
        var firstStartNr = 1;
		var firstEndNr = HRS.itemsPerPage;
		var currentStartNr = (HRS.pageNumber-1) * HRS.itemsPerPage + 1;
		var currentEndNr = HRS.pageNumber * HRS.itemsPerPage;

		var prevHTML = '<span style="display:inline-block;width:48px;text-align:right;">';
		var firstHTML = '<span style="display:inline-block;min-width:48px;text-align:right;vertical-align:top;margin-top:4px;">';
		var currentHTML = '<span style="display:inline-block;min-width:48px;text-align:left;vertical-align:top;margin-top:4px;">';
		var nextHTML = '<span style="display:inline-block;width:48px;text-align:left;">';

		if (HRS.pageNumber > 1) {
			prevHTML += "<a href='#' data-page='" + (HRS.pageNumber - 1) + "' title='" + $.t("previous") + "' style='font-size:20px;'>";
			prevHTML += "<i class='fa fa-arrow-circle-left'></i></a>";
		} else {
			prevHTML += '&nbsp;';
		}

		if (HRS.hasMorePages) {
			currentHTML += currentStartNr + "-" + currentEndNr + "&nbsp;";
			nextHTML += "<a href='#' data-page='" + (HRS.pageNumber + 1) + "' title='" + $.t("next") + "' style='font-size:20px;'>";
			nextHTML += "<i class='fa fa-arrow-circle-right'></i></a>";
		} else {
			if (HRS.pageNumber > 1) {
				currentHTML += currentStartNr + "+";
			} else {
				currentHTML += "&nbsp;";
			}
			nextHTML += "&nbsp;";
		}
		if (HRS.pageNumber > 1) {
			firstHTML += "&nbsp;<a href='#' data-page='1'>" + firstStartNr + "-" + firstEndNr + "</a>&nbsp;|&nbsp;";
		} else {
			firstHTML += "&nbsp;";
		}

		prevHTML += '</span>';
		firstHTML += '</span>';
		currentHTML += '</span>';
		nextHTML += '</span>';

		var output = prevHTML + firstHTML + currentHTML + nextHTML;
		var $paginationContainer = $("#" + HRS.currentPage + "_page .data-pagination");

		if ($paginationContainer.length) {
			$paginationContainer.html(output);
		}
	};

	$(document).on("click", ".data-pagination a", function(e) {
		e.preventDefault();

		HRS.goToPageNumber($(this).data("page"));
	});

	HRS.goToPageNumber = function(pageNumber) {
		/*if (!pageLoaded) {
			return;
		}*/
		HRS.pageNumber = pageNumber;

		HRS.pageLoading();

		HRS.pages[HRS.currentPage]();
	};



	HRS.initUserDBSuccess = function() {
		HRS.database.select("data", [{
			"id": "asset_exchange_version"
		}], function(error, result) {
			if (!result || !result.length) {
				HRS.database.delete("assets", [], function(error) {
					if (!error) {
						HRS.database.insert("data", {
							"id": "asset_exchange_version",
							"contents": 2
						});
					}
				});
			}
		});

		HRS.database.select("data", [{
			"id": "closed_groups"
		}], function(error, result) {
			if (result && result.length) {
				HRS.closedGroups = result[0].contents.split("#");
			} else {
				HRS.database.insert("data", {
					id: "closed_groups",
					contents: ""
				});
			}
		});

		HRS.databaseSupport = true;
        HRS.logConsole("Browser database initialized");
		HRS.loadContacts();
		HRS.getSettings();
		HRS.updateNotifications();
		HRS.setUnconfirmedNotifications();
		HRS.setPhasingNotifications();
	};

	HRS.initUserDBWithLegacyData = function() {
		var legacyTables = ["contacts", "assets", "data"];
		$.each(legacyTables, function(key, table) {
			HRS.legacyDatabase.select(table, null, function(error, results) {
				if (!error && results && results.length >= 0) {
					HRS.database.insert(table, results, function(error, inserts) {});
				}
			});
		});
		setTimeout(function(){ HRS.initUserDBSuccess(); }, 1000);
	};

	HRS.initUserDBFail = function() {
		HRS.database = null;
		HRS.databaseSupport = false;
		HRS.getSettings();
		HRS.updateNotifications();
		HRS.setUnconfirmedNotifications();
		HRS.setPhasingNotifications();
	};

	HRS.createLegacyDatabase = function() {
		var schema = {};
		var versionLegacyDB = 2;

		// Legacy DB before switching to account based DBs, leave schema as is
		schema["contacts"] = {
			id: {
				"primary": true,
				"autoincrement": true,
				"type": "NUMBER"
			},
			name: "VARCHAR(100) COLLATE NOCASE",
			email: "VARCHAR(200)",
			account: "VARCHAR(25)",
			accountRS: "VARCHAR(25)",
			description: "TEXT"
		};
		schema["assets"] = {
			account: "VARCHAR(25)",
			accountRS: "VARCHAR(25)",
			asset: {
				"primary": true,
				"type": "VARCHAR(25)"
			},
			description: "TEXT",
			name: "VARCHAR(10)",
			decimals: "NUMBER",
			quantityQNT: "VARCHAR(15)",
			groupName: "VARCHAR(30) COLLATE NOCASE"
		};
		schema["data"] = {
			id: {
				"primary": true,
				"type": "VARCHAR(40)"
			},
			contents: "TEXT"
		};
		if (versionLegacyDB == HRS.constants.DB_VERSION) {
			try {
				HRS.legacyDatabase = new WebDB("HRS_USER_DB", schema, versionLegacyDB, 4, function(error) {
					if (!error) {
						HRS.legacyDatabase.select("data", [{
							"id": "settings"
						}], function(error, result) {
							if (result && result.length > 0) {
								HRS.legacyDatabaseWithData = true;
							}
						});
					}
				});
			} catch (err) {
                HRS.logConsole("error creating database " + err.message);
			}
		}
	};

	HRS.createDatabase = function(dbName) {
		var schema = {};

		schema["contacts"] = {
			id: {
				"primary": true,
				"autoincrement": true,
				"type": "NUMBER"
			},
			name: "VARCHAR(100) COLLATE NOCASE",
			email: "VARCHAR(200)",
			account: "VARCHAR(25)",
			accountRS: "VARCHAR(25)",
			description: "TEXT"
		};
		schema["assets"] = {
			account: "VARCHAR(25)",
			accountRS: "VARCHAR(25)",
			asset: {
				"primary": true,
				"type": "VARCHAR(25)"
			},
			description: "TEXT",
			name: "VARCHAR(10)",
			decimals: "NUMBER",
			quantityQNT: "VARCHAR(15)",
			groupName: "VARCHAR(30) COLLATE NOCASE"
		};
		schema["polls"] = {
			account: "VARCHAR(25)",
			accountRS: "VARCHAR(25)",
			name: "VARCHAR(100)",
			description: "TEXT",
			poll: "VARCHAR(25)",
			finishHeight: "VARCHAR(25)"
		};
		schema["data"] = {
			id: {
				"primary": true,
				"type": "VARCHAR(40)"
			},
			contents: "TEXT"
		};

		HRS.assetTableKeys = ["account", "accountRS", "asset", "description", "name", "position", "decimals", "quantityQNT", "groupName"];
		HRS.pollsTableKeys = ["account", "accountRS", "poll", "description", "name", "finishHeight"];


		try {
			HRS.database = new WebDB(dbName, schema, HRS.constants.DB_VERSION, 4, function(error) {
				if (!error) {
					HRS.database.select("data", [{
						"id": "settings"
					}], function(error, result) {
						if (result && result.length > 0) {
							HRS.databaseFirstStart = false;
							HRS.initUserDBSuccess();
						} else {
							HRS.databaseFirstStart = true;
							if (HRS.databaseFirstStart && HRS.legacyDatabaseWithData) {
								HRS.initUserDBWithLegacyData();
							} else {
								HRS.initUserDBSuccess();
							}
						}
					});
				} else {
					HRS.initUserDBFail();
				}
			});
		} catch (err) {
			HRS.initUserDBFail();
		}
	};

	/* Display connected state in Sidebar */
	HRS.checkConnected = function() {
		HRS.sendRequest("getPeers+", {
			"state": "CONNECTED"
		}, function(response) {
            var connectedIndicator = $("#connected_indicator");
            if (response.peers && response.peers.length) {
				HRS.peerConnect = true;
				connectedIndicator.addClass("connected");
                connectedIndicator.find("span").html($.t("Connected")).attr("data-i18n", "connected");
				connectedIndicator.show();
			} else {
				HRS.peerConnect = false;
				connectedIndicator.removeClass("connected");
                connectedIndicator.find("span").html($.t("Not Connected")).attr("data-i18n", "not_connected");
				connectedIndicator.show();
			}
		});
	};

	HRS.getAccountInfo = function(firstRun, callback) {
		HRS.sendRequest("getAccount", {
			"account": HRS.account,
			"includeAssets": true,
			"includeCurrencies": true,
			"includeLessors": true,
			"includeEffectiveBalance": true
		}, function(response) {
			var previousAccountInfo = HRS.accountInfo;

			HRS.accountInfo = response;

			if (response.errorCode) {
				$("#account_balance, #account_balance_sidebar, #account_nr_assets, #account_assets_balance, #account_currencies_balance, #account_nr_currencies, #account_purchase_count, #account_pending_sale_count, #account_completed_sale_count, #account_message_count, #account_alias_count").html("0");

				if (HRS.accountInfo.errorCode == 5) {
					if (HRS.downloadingBlockchain) {
						if (HRS.newlyCreatedAccount) {
                            $("#dashboard_message").addClass("alert-success").removeClass("alert-danger").html($.t("status_new_account", {
                                "account_id": String(HRS.accountRS).escapeHTML(),
                                "public_key": String(HRS.publicKey).escapeHTML()
                            }) + "<br/><br/>" + $.t("status_blockchain_downloading") +
                            "<br/><br/>" + HRS.getFundAccountLink()).show();
						} else {
							$("#dashboard_message").addClass("alert-success").removeClass("alert-danger").html($.t("status_blockchain_downloading")).show();
						}
					} else if (HRS.state && HRS.state.isScanning) {
						$("#dashboard_message").addClass("alert-danger").removeClass("alert-success").html($.t("status_blockchain_rescanning")).show();
					} else {
                        if (HRS.publicKey == "") {
                            $("#dashboard_message").addClass("alert-success").removeClass("alert-danger").html($.t("status_new_account_no_pk_v2", {
                                "account_id": String(HRS.accountRS).escapeHTML()
                            })).show();
                        } else {
                            $("#dashboard_message").addClass("alert-success").removeClass("alert-danger").html($.t("status_new_account", {
                                "account_id": String(HRS.accountRS).escapeHTML(),
                                "public_key": String(HRS.publicKey).escapeHTML()
                            }) + "<br/><br/>" + HRS.getFundAccountLink()).show();
                        }
					}
				} else {
					$("#dashboard_message").addClass("alert-danger").removeClass("alert-success").html(HRS.accountInfo.errorDescription ? HRS.accountInfo.errorDescription.escapeHTML() : $.t("error_unknown")).show();
				}
			} else {
				if (HRS.accountRS && HRS.accountInfo.accountRS != HRS.accountRS) {
					$.growl("Generated Reed Solomon address different from the one in the blockchain!", {
						"type": "danger"
					});
					HRS.accountRS = HRS.accountInfo.accountRS;
				}

				if (HRS.downloadingBlockchain) {
					$("#dashboard_message").addClass("alert-success").removeClass("alert-danger").html($.t("status_blockchain_downloading")).show();
				} else if (HRS.state && HRS.state.isScanning) {
					$("#dashboard_message").addClass("alert-danger").removeClass("alert-success").html($.t("status_blockchain_rescanning")).show();
				} else if (!HRS.accountInfo.publicKey) {
                    var warning = HRS.publicKey != 'undefined' ? $.t("public_key_not_announced_warning", { "public_key": HRS.publicKey }) : $.t("no_public_key_warning");
					$("#dashboard_message").addClass("alert-danger").removeClass("alert-success").html(warning + " " + $.t("public_key_actions")).show();
				} else {
					$("#dashboard_message").hide();
				}

				//only show if happened within last week
				var showAssetDifference = (!HRS.downloadingBlockchain || (HRS.blocks && HRS.blocks[0] && HRS.state && HRS.state.time - HRS.blocks[0].timestamp < 60 * 60 * 24 * 7));

				if (HRS.databaseSupport) {
					HRS.database.select("data", [{
						"id": "asset_balances"
					}], function(error, asset_balance) {
						if (asset_balance && asset_balance.length) {
							var previous_balances = asset_balance[0].contents;
							if (!HRS.accountInfo.assetBalances) {
								HRS.accountInfo.assetBalances = [];
							}
							var current_balances = JSON.stringify(HRS.accountInfo.assetBalances);
							if (previous_balances != current_balances) {
								if (previous_balances != "undefined" && typeof previous_balances != "undefined") {
									previous_balances = JSON.parse(previous_balances);
								} else {
									previous_balances = [];
								}
								HRS.database.update("data", {
									contents: current_balances
								}, [{
									id: "asset_balances"
								}]);
								if (showAssetDifference) {
									HRS.checkAssetDifferences(HRS.accountInfo.assetBalances, previous_balances);
								}
							}
						} else {
							HRS.database.insert("data", {
								id: "asset_balances",
								contents: JSON.stringify(HRS.accountInfo.assetBalances)
							});
						}
					});
				} else if (showAssetDifference && previousAccountInfo && previousAccountInfo.assetBalances) {
					var previousBalances = JSON.stringify(previousAccountInfo.assetBalances);
					var currentBalances = JSON.stringify(HRS.accountInfo.assetBalances);

					if (previousBalances != currentBalances) {
						HRS.checkAssetDifferences(HRS.accountInfo.assetBalances, previousAccountInfo.assetBalances);
					}
				}

				$("#account_balance, #account_balance_sidebar").html(HRS.formatStyledAmount(response.unconfirmedBalanceDQT));
				$("#account_forged_balance").html(HRS.formatStyledAmount(response.forgedBalanceDQT));
                var i;
				if (response.assetBalances) {
                    var assets = [];
                    var assetBalances = response.assetBalances;
                    var assetBalancesMap = {};
                    for (i = 0; i < assetBalances.length; i++) {
                        if (assetBalances[i].balanceQNT != "0") {
                            assets.push(assetBalances[i].asset);
                            assetBalancesMap[assetBalances[i].asset] = assetBalances[i].balanceQNT;
                        }
                    }
                    HRS.sendRequest("getLastTrades", {
                        "assets": assets
                    }, function(response) {
                        if (response.trades && response.trades.length) {
                            var assetTotal = 0;
                            for (i=0; i < response.trades.length; i++) {
                                var trade = response.trades[i];
                                assetTotal += assetBalancesMap[trade.asset] * trade.priceDQT / 100000000;
                            }
                            $("#account_assets_balance").html(HRS.formatStyledAmount(new Big(assetTotal).toFixed(8)));
                            $("#account_nr_assets").html(response.trades.length);
                        } else {
                            $("#account_assets_balance").html(0);
                            $("#account_nr_assets").html(0);
                        }
                    });
                } else {
                    $("#account_assets_balance").html(0);
                    $("#account_nr_assets").html(0);
                }

				if (response.accountCurrencies) {
                    var currencies = [];
                    var currencyBalances = response.accountCurrencies;
					var numberOfCurrencies = currencyBalances.length;
					$("#account_nr_currencies").html(numberOfCurrencies);
                    var currencyBalancesMap = {};
                    for (i = 0; i < numberOfCurrencies; i++) {
                        if (currencyBalances[i].units != "0") {
                            currencies.push(currencyBalances[i].currency);
                            currencyBalancesMap[currencyBalances[i].currency] = currencyBalances[i].units;
                        }
                    }
                    HRS.sendRequest("getLastExchanges", {
                        "currencies": currencies
                    }, function(response) {
                        if (response.exchanges && response.exchanges.length) {
                            var currencyTotal = 0;
                            for (i=0; i < response.exchanges.length; i++) {
                                var exchange = response.exchanges[i];
                                currencyTotal += currencyBalancesMap[exchange.currency] * exchange.rateDQT / 100000000;
                            }
                            $("#account_currencies_balance").html(HRS.formatStyledAmount(new Big(currencyTotal).toFixed(8)));
                        } else {
                            $("#account_currencies_balance").html(0);
                        }
                    });
                } else {
                    $("#account_currencies_balance").html(0);
                    $("#account_nr_currencies").html(0);
                }

				/* Display message count in top and limit to 100 for now because of possible performance issues*/
				HRS.sendRequest("getBlockchainTransactions+", {
					"account": HRS.account,
					"type": 1,
					"subtype": 0,
					"firstIndex": 0,
					"lastIndex": 99
				}, function(response) {
					if (response.transactions && response.transactions.length) {
						if (response.transactions.length > 99)
							$("#account_message_count").empty().append("99+");
						else
							$("#account_message_count").empty().append(response.transactions.length);
					} else {
						$("#account_message_count").empty().append("0");
					}
				});

				/***  ******************   ***/

				HRS.sendRequest("getAliasCount+", {
					"account":HRS.account
				}, function(response) {
					if (response.numberOfAliases != null) {
						$("#account_alias_count").empty().append(response.numberOfAliases);
					}
				});

				HRS.sendRequest("getDGSPurchaseCount+", {
					"buyer": HRS.account
				}, function(response) {
					if (response.numberOfPurchases != null) {
						$("#account_purchase_count").empty().append(response.numberOfPurchases);
					}
				});

				HRS.sendRequest("getDGSPendingPurchases+", {
					"seller": HRS.account
				}, function(response) {
					if (response.purchases && response.purchases.length) {
						$("#account_pending_sale_count").empty().append(response.purchases.length);
					} else {
						$("#account_pending_sale_count").empty().append("0");
					}
				});

				HRS.sendRequest("getDGSPurchaseCount+", {
					"seller": HRS.account,
					"completed": true
				}, function(response) {
					if (response.numberOfPurchases != null) {
						$("#account_completed_sale_count").empty().append(response.numberOfPurchases);
					}
				});

                var leasingChange = false;
				if (HRS.lastBlockHeight) {
					var isLeased = HRS.lastBlockHeight >= HRS.accountInfo.currentLeasingHeightFrom;
					if (isLeased != HRS.IsLeased) {
						leasingChange = true;
						HRS.isLeased = isLeased;
					}
				}

				if (leasingChange ||
					(response.currentLeasingHeightFrom != previousAccountInfo.currentLeasingHeightFrom) ||
					(response.lessors && !previousAccountInfo.lessors) ||
					(!response.lessors && previousAccountInfo.lessors) ||
					(response.lessors && previousAccountInfo.lessors && response.lessors.sort().toString() != previousAccountInfo.lessors.sort().toString())) {
					HRS.updateAccountLeasingStatus();
				}

				HRS.updateAccountControlStatus();

				if (response.name) {
					$("#account_name").html(HRS.addEllipsis(response.name.escapeHTML(), 10)).removeAttr("data-i18n");
				}
			}

			if (firstRun) {
				$("#account_balance, #account_balance_sidebar, #account_assets_balance, #account_nr_assets, #account_currencies_balance, #account_nr_currencies, #account_purchase_count, #account_pending_sale_count, #account_completed_sale_count, #account_message_count, #account_alias_count").removeClass("loading_dots");
			}

			if (callback) {
				callback();
			}
		});
	};

	HRS.updateAccountLeasingStatus = function() {
		var accountLeasingLabel = "";
		var accountLeasingStatus = "";
		var nextLesseeStatus = "";
		if (HRS.accountInfo.nextLeasingHeightFrom < HRS.constants.MAX_INT_JAVA) {
			nextLesseeStatus = $.t("next_lessee_status", {
				"start": String(HRS.accountInfo.nextLeasingHeightFrom).escapeHTML(),
				"end": String(HRS.accountInfo.nextLeasingHeightTo).escapeHTML(),
				"account": String(HRS.convertNumericToRSAccountFormat(HRS.accountInfo.nextLessee)).escapeHTML()
			})
		}

		if (HRS.lastBlockHeight >= HRS.accountInfo.currentLeasingHeightFrom) {
			accountLeasingLabel = $.t("leased_out");
			accountLeasingStatus = $.t("balance_is_leased_out", {
				"blocks": String(HRS.accountInfo.currentLeasingHeightTo - HRS.lastBlockHeight).escapeHTML(),
				"end": String(HRS.accountInfo.currentLeasingHeightTo).escapeHTML(),
				"account": String(HRS.accountInfo.currentLesseeRS).escapeHTML()
			});
			$("#lease_balance_message").html($.t("balance_leased_out_help"));
		} else if (HRS.lastBlockHeight < HRS.accountInfo.currentLeasingHeightTo) {
			accountLeasingLabel = $.t("leased_soon");
			accountLeasingStatus = $.t("balance_will_be_leased_out", {
				"blocks": String(HRS.accountInfo.currentLeasingHeightFrom - HRS.lastBlockHeight).escapeHTML(),
				"start": String(HRS.accountInfo.currentLeasingHeightFrom).escapeHTML(),
				"end": String(HRS.accountInfo.currentLeasingHeightTo).escapeHTML(),
				"account": String(HRS.accountInfo.currentLesseeRS).escapeHTML()
			});
			$("#lease_balance_message").html($.t("balance_leased_out_help"));
		} else {
			accountLeasingStatus = $.t("balance_not_leased_out");
			$("#lease_balance_message").html($.t("balance_leasing_help"));
		}
		if (nextLesseeStatus != "") {
			accountLeasingStatus += "<br>" + nextLesseeStatus;
		}

		//no reed solomon available? do it myself? todo
        var accountLessorTable = $("#account_lessor_table");
        if (HRS.accountInfo.lessors) {
			if (accountLeasingLabel) {
				accountLeasingLabel += ", ";
				accountLeasingStatus += "<br /><br />";
			}

			accountLeasingLabel += $.t("x_lessor", {
				"count": HRS.accountInfo.lessors.length
			});
			accountLeasingStatus += $.t("x_lessor_lease", {
				"count": HRS.accountInfo.lessors.length
			});

			var rows = "";

			for (var i = 0; i < HRS.accountInfo.lessorsRS.length; i++) {
				var lessor = HRS.accountInfo.lessorsRS[i];
				var lessorInfo = HRS.accountInfo.lessorsInfo[i];
				var blocksLeft = lessorInfo.currentHeightTo - HRS.lastBlockHeight;
				var blocksLeftTooltip = "From block " + lessorInfo.currentHeightFrom + " to block " + lessorInfo.currentHeightTo;
				var nextLessee = "Not set";
				var nextTooltip = "Next lessee not set";
				if (lessorInfo.nextLesseeRS == HRS.accountRS) {
					nextLessee = "You";
					nextTooltip = "From block " + lessorInfo.nextHeightFrom + " to block " + lessorInfo.nextHeightTo;
				} else if (lessorInfo.nextHeightFrom < HRS.constants.MAX_INT_JAVA) {
					nextLessee = "Not you";
					nextTooltip = "Account " + HRS.getAccountTitle(lessorInfo.nextLesseeRS) +" from block " + lessorInfo.nextHeightFrom + " to block " + lessorInfo.nextHeightTo;
				}
				rows += "<tr>" +
					"<td>" + HRS.getAccountLink({ lessorRS: lessor }, "lessor") + "</td>" +
					"<td>" + String(lessorInfo.effectiveBalanceHBIT).escapeHTML() + "</td>" +
					"<td><label>" + String(blocksLeft).escapeHTML() + " <i class='fa fa-question-circle show_popover' data-toggle='tooltip' title='" + blocksLeftTooltip + "' data-placement='right' style='color:#4CAA6E'></i></label></td>" +
					"<td><label>" + String(nextLessee).escapeHTML() + " <i class='fa fa-question-circle show_popover' data-toggle='tooltip' title='" + nextTooltip + "' data-placement='right' style='color:#4CAA6E'></i></label></td>" +
				"</tr>";
			}

			accountLessorTable.find("tbody").empty().append(rows);
			$("#account_lessor_container").show();
			accountLessorTable.find("[data-toggle='tooltip']").tooltip();
		} else {
			accountLessorTable.find("tbody").empty();
			$("#account_lessor_container").hide();
		}

		if (accountLeasingLabel) {
			$("#account_leasing").html(accountLeasingLabel).show();
		} else {
			$("#account_leasing").hide();
		}

		if (accountLeasingStatus) {
			$("#account_leasing_status").html(accountLeasingStatus).show();
		} else {
			$("#account_leasing_status").hide();
		}
	};

	HRS.updateAccountControlStatus = function() {
		var onNoPhasingOnly = function() {
			$("#setup_mandatory_approval").show();
			$("#mandatory_approval_details").hide();
			delete HRS.accountInfo.phasingOnly;
		};
		if (HRS.accountInfo.accountControls && $.inArray('PHASING_ONLY', HRS.accountInfo.accountControls) > -1) {
			HRS.sendRequest("getPhasingOnlyControl", {
				"account": HRS.account
			}, function (response) {
				if (response && response.votingModel >= 0) {
					$("#setup_mandatory_approval").hide();
					$("#mandatory_approval_details").show();

					HRS.accountInfo.phasingOnly = response;
					var infoTable = $("#mandatory_approval_info_table");
					infoTable.find("tbody").empty();
					var data = {};
					var params = HRS.phasingControlObjectToPhasingParams(response);
					params.phasingWhitelist = params.phasingWhitelisted;
					HRS.getPhasingDetails(data, params);
					delete data.full_hash_formatted_html;
					if (response.minDuration) {
						data.minimum_duration_short = response.minDuration;
					}

					if (response.maxDuration) {
						data.maximum_duration_short = response.maxDuration;
					}

					if (response.maxFees) {
						data.maximum_fees = HRS.convertToHBIT(response.maxFees);
					}

					infoTable.find("tbody").append(HRS.createInfoTable(data));
					infoTable.show();
				} else {
					onNoPhasingOnly();
				}

			});

		} else {
			onNoPhasingOnly();
		}
	};

	HRS.checkAssetDifferences = function(current_balances, previous_balances) {
		var current_balances_ = {};
		var previous_balances_ = {};

		if (previous_balances && previous_balances.length) {
			for (var k in previous_balances) {
                if (!previous_balances.hasOwnProperty(k)) {
                    continue;
                }
				previous_balances_[previous_balances[k].asset] = previous_balances[k].balanceQNT;
			}
		}

		if (current_balances && current_balances.length) {
			for (k in current_balances) {
                if (!current_balances.hasOwnProperty(k)) {
                    continue;
                }
				current_balances_[current_balances[k].asset] = current_balances[k].balanceQNT;
			}
		}

		var diff = {};

		for (k in previous_balances_) {
            if (!previous_balances_.hasOwnProperty(k)) {
                continue;
            }
			if (!(k in current_balances_)) {
				diff[k] = "-" + previous_balances_[k];
			} else if (previous_balances_[k] !== current_balances_[k]) {
                diff[k] = (new BigInteger(current_balances_[k]).subtract(new BigInteger(previous_balances_[k]))).toString();
			}
		}

		for (k in current_balances_) {
            if (!current_balances_.hasOwnProperty(k)) {
                continue;
            }
			if (!(k in previous_balances_)) {
				diff[k] = current_balances_[k]; // property is new
			}
		}

		var nr = Object.keys(diff).length;
		if (nr == 0) {
        } else if (nr <= 3) {
			for (k in diff) {
                if (!diff.hasOwnProperty(k)) {
                    continue;
                }
				HRS.sendRequest("getAsset", {
					"asset": k,
					"_extra": {
						"asset": k,
						"difference": diff[k]
					}
				}, function(asset, input) {
					if (asset.errorCode) {
						return;
					}
					asset.difference = input["_extra"].difference;
					asset.asset = input["_extra"].asset;
                    var quantity;
					if (asset.difference.charAt(0) != "-") {
						quantity = HRS.formatQuantity(asset.difference, asset.decimals);

						if (quantity != "0") {
							if (parseInt(quantity) == 1) {
								$.growl($.t("you_received_assets", {
									"name": String(asset.name).escapeHTML()
								}), {
									"type": "success"
								});
							} else {
								$.growl($.t("you_received_assets_plural", {
									"name": String(asset.name).escapeHTML(),
									"count": quantity
								}), {
									"type": "success"
								});
							}
							HRS.loadAssetExchangeSidebar();
						}
					} else {
						asset.difference = asset.difference.substring(1);
						quantity = HRS.formatQuantity(asset.difference, asset.decimals);
						if (quantity != "0") {
							if (parseInt(quantity) == 1) {
								$.growl($.t("you_sold_assets", {
									"name": String(asset.name).escapeHTML()
								}), {
									"type": "success"
								});
							} else {
								$.growl($.t("you_sold_assets_plural", {
									"name": String(asset.name).escapeHTML(),
									"count": quantity
								}), {
									"type": "success"
								});
							}
							HRS.loadAssetExchangeSidebar();
						}
					}
				});
			}
		} else {
			$.growl($.t("multiple_assets_differences"), {
				"type": "success"
			});
		}
	};

	HRS.checkLocationHash = function(password) {
		if (window.location.hash) {
			var hash = window.location.hash.replace("#", "").split(":");

			if (hash.length == 2) {
                var $modal = "";
                if (hash[0] == "message") {
					$modal = $("#send_message_modal");
				} else if (hash[0] == "send") {
					$modal = $("#send_money_modal");
				} else if (hash[0] == "asset") {
					HRS.goToAsset(hash[1]);
					return;
				}

				if ($modal) {
					var account_id = String($.trim(hash[1]));
					$modal.find("input[name=recipient]").val(account_id.unescapeHTML()).trigger("blur");
					if (password && typeof password == "string") {
						$modal.find("input[name=secretPhrase]").val(password);
					}
					$modal.modal("show");
				}
			}

			window.location.hash = "#";
		}
	};

	HRS.updateBlockchainDownloadProgress = function() {
		var lastNumBlocks = 5000;
        var downloadingBlockchain = $('#downloading_blockchain');
        downloadingBlockchain.find('.last_num_blocks').html($.t('last_num_blocks', { "blocks": lastNumBlocks }));

		if (!HRS.serverConnect || !HRS.peerConnect) {
			downloadingBlockchain.find(".db_active").hide();
			downloadingBlockchain.find(".db_halted").show();
		} else {
			downloadingBlockchain.find(".db_halted").hide();
			downloadingBlockchain.find(".db_active").show();

			var percentageTotal = 0;
			var blocksLeft;
			var percentageLast = 0;
			if (HRS.state.lastBlockchainFeederHeight && HRS.state.numberOfBlocks <= HRS.state.lastBlockchainFeederHeight) {
				percentageTotal = parseInt(Math.round((HRS.state.numberOfBlocks / HRS.state.lastBlockchainFeederHeight) * 100), 10);
				blocksLeft = HRS.state.lastBlockchainFeederHeight - HRS.state.numberOfBlocks;
				if (blocksLeft <= lastNumBlocks && HRS.state.lastBlockchainFeederHeight > lastNumBlocks) {
					percentageLast = parseInt(Math.round(((lastNumBlocks - blocksLeft) / lastNumBlocks) * 100), 10);
				}
			}
			if (!blocksLeft || blocksLeft < parseInt(lastNumBlocks / 2)) {
				downloadingBlockchain.find(".db_progress_total").hide();
			} else {
				downloadingBlockchain.find(".db_progress_total").show();
				downloadingBlockchain.find(".db_progress_total .progress-bar").css("width", percentageTotal + "%");
				downloadingBlockchain.find(".db_progress_total .sr-only").html($.t("percent_complete", {
					"percent": percentageTotal
				}));
			}
			if (!blocksLeft || blocksLeft >= (lastNumBlocks * 2) || HRS.state.lastBlockchainFeederHeight <= lastNumBlocks) {
				downloadingBlockchain.find(".db_progress_last").hide();
			} else {
				downloadingBlockchain.find(".db_progress_last").show();
				downloadingBlockchain.find(".db_progress_last .progress-bar").css("width", percentageLast + "%");
				downloadingBlockchain.find(".db_progress_last .sr-only").html($.t("percent_complete", {
					"percent": percentageLast
				}));
			}
			if (blocksLeft) {
				downloadingBlockchain.find(".blocks_left_outer").show();
				downloadingBlockchain.find(".blocks_left").html($.t("blocks_left", { "numBlocks": blocksLeft }));
			}
		}
	};

	HRS.checkIfOnAFork = function() {
		if (!HRS.downloadingBlockchain) {
			var onAFork = true;

			if (HRS.blocks && HRS.blocks.length >= 10) {
				for (var i = 0; i < 10; i++) {
					if (HRS.blocks[i].generator != HRS.account) {
						onAFork = false;
						break;
					}
				}
			} else {
				onAFork = false;
			}

			if (onAFork) {
				$.growl($.t("fork_warning"), {
					"type": "danger"
				});
			}
		}
	};

    HRS.printEnvInfo = function() {
        HRS.logProperty("navigator.userAgent");
        HRS.logProperty("navigator.platform");
        HRS.logProperty("navigator.appVersion");
        HRS.logProperty("navigator.appName");
        HRS.logProperty("navigator.appCodeName");
        HRS.logProperty("navigator.hardwareConcurrency");
        HRS.logProperty("navigator.maxTouchPoints");
        HRS.logProperty("navigator.languages");
        HRS.logProperty("navigator.language");
        HRS.logProperty("navigator.cookieEnabled");
        HRS.logProperty("navigator.onLine");
        HRS.logProperty("HRS.isTestNet");
        HRS.logProperty("HRS.needsAdminPassword");
    };

	$("#id_search").on("submit", function(e) {
		e.preventDefault();

		var id = $.trim($("#id_search").find("input[name=q]").val());

		if (/HBIT\-/i.test(id)) {
			HRS.sendRequest("getAccount", {
				"account": id
			}, function(response, input) {
				if (!response.errorCode) {
					response.account = input.account;
					HRS.showAccountModal(response);
				} else {
					$.growl($.t("error_search_no_results"), {
						"type": "danger"
					});
				}
			});
		} else {
			if (!/^\d+$/.test(id)) {
				$.growl($.t("error_search_invalid"), {
					"type": "danger"
				});
				return;
			}
			HRS.sendRequest("getTransaction", {
				"transaction": id
			}, function(response, input) {
				if (!response.errorCode) {
					response.transaction = input.transaction;
					HRS.showTransactionModal(response);
				} else {
					HRS.sendRequest("getAccount", {
						"account": id
					}, function(response, input) {
						if (!response.errorCode) {
							response.account = input.account;
							HRS.showAccountModal(response);
						} else {
							HRS.sendRequest("getBlock", {
								"block": id,
                                "includeTransactions": "true"
							}, function(response, input) {
								if (!response.errorCode) {
									response.block = input.block;
									HRS.showBlockModal(response);
								} else {
									$.growl($.t("error_search_no_results"), {
										"type": "danger"
									});
								}
							});
						}
					});
				}
			});
		}
	});

	return HRS;
}(HRS || {}, jQuery));

$(document).ready(function() {
	//HRS.init();
});

function _checkDOMenabled() {
    var storage;
    var fail;
    var uid;
    try {
        uid = String(new Date());
        (storage = window.localStorage).setItem(uid, uid);
        fail = storage.getItem(uid) != uid;
        storage.removeItem(uid);
        fail && (storage = false);
    } catch (exception) {
    }
    return storage;
}