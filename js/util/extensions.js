var __entityMap = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': '&quot;',
	"'": '&#39;'
};

String.prototype.escapeHTML = function() {
	return String(this).replace(/[&<>"']/g, function(s) {
		return __entityMap[s];
	});
};

String.prototype.unescapeHTML = function() {
	return String(this).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace('&quot;', '"').replace('&#39;', "'").replace('&#x2F;', "/");
};

String.prototype.nl2br = function() {
	return String(this).replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
};

String.prototype.capitalize = function() {
	return this.charAt(0).toUpperCase() + this.slice(1);
};

Number.prototype.pad = function(size) {
	var s = String(this);
	if (typeof(size) !== "number") {
		size = 2;
	}

	while (s.length < size) {
		s = "0" + s;
	}
	return s;
};

if (typeof Object.keys !== "function") {
	(function() {
		Object.keys = Object_keys;

		function Object_keys(obj) {
			var keys = [],
				name;
			for (name in obj) {
				if (obj.hasOwnProperty(name)) {
					keys.push(name);
				}
			}
			return keys;
		}
	})();
}

$.fn.hasAttr = function(name) {
	var attr = this.attr(name);

	return attr !== undefined && attr !== false;
};

//https://github.com/bryanwoods/autolink-js/blob/master/autolink.js
String.prototype['autoLink'] = function () {
	var output = String(this).escapeHTML();
	var pattern = /(^|\s)((?:https?|ftp):\/\/[\-A-Z0-9+\u0026\u2019@#\/%?=()~_|!:,.;]*[\-A-Z0-9+\u0026@#\/%=~()_|])/gi;
	//noinspection HtmlUnknownTarget
	return output.replace(pattern, "$1<a href='$2' target='_blank'>$2</a>");
};
