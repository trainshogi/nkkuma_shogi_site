var file    = document.getElementById('upfile');
var pic1    = document.getElementById('pic1');
var contents = document.getElementsByClassName('contents');
var uploadImgSrc;
var canvasWidth  = $('.contents').width();
var canvasHeight = $('.contents').height();
var img = new Image();
var rotate = 0;

var debug = false;

function loadLocalImage(e) {
    // ファイル情報を取得
    var fileData = e.target.files[0];

    // 画像ファイル以外は処理を止める
    if(!fileData.type.match('image.*')) {
        alert('画像を選択してください');
        return;
    }

    // // FileReaderオブジェクトを使ってファイル読み込み
    // var reader = new FileReader();
    // // ファイル読み込みに成功したときの処理
    // reader.onload = function() {
    //     // Canvas上に表示する
    //     uploadImgSrc = reader.result;
    //     // $('#pic1').attr('src',uploadImgSrc)
    //     canvasDraw();
    // }
    // // ファイル読み込みを実行
    // reader.readAsDataURL(fileData);

    load(file, function(canvas) {
      $('#pic1_parent').empty();
      $('#pic1_parent').appendChild(canvas);
    });
}

// ファイルが指定された時にloadLocalImage()を実行
file.addEventListener('change', loadLocalImage, false);

function load(file, callback) {
  // canvas: true にすると canvas に画像を描画する(回転させる場合は必須オプション)
  var options = {canvas: true};

  loadImage.parseMetaData(file, function (data) {
    if (data.exif) {
      // console.log("exifに格納されている情報:\n", data.exif.getAll());

      // options の orientation は小文字。 exif.getの 'Orientation' は先頭大文字
      // ここでcanvasの回転を指定している
      options.orientation = data.exif.get('Orientation');
      console.log('Orientation: ' + options.orientation);
    }
    // 画像の読み込み。完了時に callback が呼び出される
    loadImage(file, callback, options);
  });
}

// Canvas上に画像を表示する
function canvasDraw() {    
    // Canvas上に画像を表示
    pic1.style.backgroundImage = 'url('+uploadImgSrc+')';
    img.src = uploadImgSrc;
    img.onload = function() {
      EXIF.getData(img, function () {
        // canvasのサイズ(高さ)を変えてから表示
        console.log(EXIF.pretty(this));
        // 回転方向の読み取り
        if (EXIF.pretty(this)) {
          if (EXIF.getAllTags(this).Orientation == 6) {
            rotate = 90;
            canvasHeight = img.width * (canvasWidth / img.height);
            $(".contents").height(canvasHeight);
            $("#pic1").width(canvasHeight);
            $("#pic1").height(canvasWidth);
            pic1.style.backgroundSize = canvasHeight + "px "+ canvasWidth + "px";
            pic1.style.transformOrigin = Math.round(canvasWidth/2) + "px "+ Math.round(canvasWidth/2) + "px";
            pic1.style.transform = "rotate(" + rotate + "deg)";
            pic1.style.webkitTransform = "rotate(" + rotate + "deg)"
          } else if (EXIF.getAllTags(this).Orientation == 3) {
            rotate = 180;
            canvasHeight= img.height * (canvasWidth / img.width);
            $(".contents").height(canvasHeight);
            $("#pic1").height(canvasHeight);
            pic1.style.backgroundSize = canvasWidth + "px "+ canvasHeight + "px";
            pic1.style.transform = "rotate(" + rotate + "deg)";
            pic1.style.webkitTransform = "rotate(" + rotate + "deg)"
          } else if (EXIF.getAllTags(this).Orientation == 8) {
            rotate = 270;
            canvas.height= img.width * (canvasWidth / img.height);
            difff = canvasHeight-canvasWidth;
            $(".contents").height(canvasHeight);
            $("#pic1").width(canvasHeight);
            $("#pic1").height(canvasWidth);
            pic1.style.backgroundSize = canvasHeight + "px "+ canvasWidth + "px";
            pic1.style.transformOrigin = Math.round(canvasWidth/2) + "px "+ Math.round(canvasWidth/2) + "px";
            pic1.style.transform = "rotate(" + rotate + "deg) translateX(-" + difff +"px)";
            pic1.style.webkitTransform = "rotate(" + rotate + "deg) translateX(-" + difff +"px)";
          } else{
            rotate = 0;
            canvasHeight= img.height * (canvasWidth / img.width);
            $(".contents").height(canvasHeight);
            $("#pic1").height(canvasHeight);
            pic1.style.backgroundSize = canvasWidth + "px "+ canvasHeight + "px";
          }
        }else{
          rotate = 0;
          canvasHeight= img.height * (canvasWidth / img.width);
          $(".contents").height(canvasHeight);
          $("#pic1").height(canvasHeight);
          pic1.style.backgroundSize = canvasWidth + "px "+ canvasHeight + "px";
        }
        // imgタグに表示
        // 切り抜きの四角の表示
        // draw();
      });
    }
}

function get_js_variable() {
    document.forms['input_form'].elements['hidden_rotate'].value = String(rotate); //値セットするならvalueっぽい
    document.forms['input_form'].elements['hidden_sengo'].value = String($('#sengo-event').prop('checked')); //値セットするならvalueっぽい
    console.log(document.forms['input_form'].elements['hidden_rotate'].value);
    console.log(document.forms['input_form'].elements['hidden_sengo'].value);
}