qrcode = {};
qrcode.callback = null;

qrcode.decode = function() {
    var canvasElem = $('#qr-canvas');
    var canvas = canvasElem[0];
    var dataurl = canvas.toDataURL('image/jpeg');
    var regex = /base64,(.*)/;
    var base64Array = regex.exec(dataurl);
    if(base64Array == null) {
        return;
    }
    var base64 = base64Array[1];
    HRS.sendRequest("decodeQRCode", { "qrCodeBase64": base64 },
        function(response) {
            if(qrcode.callback != null && 'qrCodeData' in response)
                if(response.qrCodeData == "") {
                    return;
                }
                qrcode.callback(response.qrCodeData);
        },
        false
    );
};
