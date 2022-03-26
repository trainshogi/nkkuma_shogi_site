$(function(){
  $("#board_img").load("shogiban.html");
  $('.dropdown-menu .dropdown-item').click(function(){
    $("#format").text($(this).attr('value'));
  });
  
  // サーバーのWarmUp
  fetch('https://mxgnhndhfb.ap-northeast-1.awsapprunner.com/warmup')
  .then(function(response) {
    console.log('Success', response.text);
  });
});

var fix_place = 'done';

function ban_click(string){
  if (fix_place != 'done'){set_uncolor(fix_place);}
  fix_place = String(8-Number(string.charAt(0)))+String(Number(string.charAt(1)));
  set_color(fix_place);
  disp_imglist();
}

function fix(string){
  var result_img = get_result_img(fix_place);
  var result_place = document.getElementById('board');
  // fix
  let tmpplace = String((9-Number(fix_place.charAt(0)))*10+(Number(fix_place.charAt(1))+1));
  result_json["ban_result"][tmpplace] = string;
  result_img.children[0].src = "../img/koma/"+string.charAt(0).trim()+alphabet2kanji(string.substr(1))+".png";
  // result_place.textContent = json_to_kif(result_json);

  set_uncolor(fix_place);
  close_imglist();
  fix_place = 'done';
}

function fix_mochigoma(method,sengo,string){
  var kazu = 1; // == real num
  var max_koma = [18,4,4,4,4,2,2];
  var result_place = document.getElementById('board');
  if(method=='add'){
    sengo_str = sengo + "_mochi"
    if (string in result_json[sengo_str]){
      if (result_json[sengo_str][string] == ""){kazu = 2;}
      else {kazu=(result_json[sengo_str][string]+1)%(max_koma[alphabet2index(string)]+1);}
    }
  }
  result_json = disp_mochigoma_sub(sengo_str,string,kazu,result_json);
  // result_place.textContent = json_to_kif(result_json);
}

function clip_text(){
  var result_txt = document.getElementById('board');
  if($("#format").text() == "kif"){
    clip_kif();
  }else if($("#format").text() == "sfen"){
    clip_sfen();
  }
  if(execCopy(result_txt.value)){
    alert('コピーできました');
  }
  else {
    alert('このブラウザでは対応していません');
  }
}
function save_text(){
  var result_txt = document.getElementById('board');
  if($("#format").text() == "kif"){
    clip_kif();
    filename = "kyokumen.kif";
  }else if($("#format").text() == "sfen"){
    clip_sfen();
    filename = "kyokumen.txt";
  }
  var blob = new Blob([result_txt.value], {type: "text/plain"}); // バイナリデータを作ります。
  // IEか他ブラウザかの判定
  if(window.navigator.msSaveBlob){
      // IEなら独自関数を使います。
      window.navigator.msSaveBlob(blob, filename);
  } else {
      // それ以外はaタグを利用してイベントを発火させます
      try {URL.revokeObjectURL();} catch (error) {}
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.target = '_blank';
      a.download = filename;
      a.click();
  }
}
function clip_kif(){
  document.getElementById('board').textContent = json_to_kif(result_json);
}
function clip_sfen(){
  document.getElementById('board').textContent = json_to_sfen(result_json);
}
function jump_kento(){
  location.href = "https://www.kento-shogi.com/?initpos=" + sfen_to_kento(json_to_sfen(result_json));
}
function jump_piyo(){
  kif_to_url(json_to_kif(result_json)).done(function(data, textStatus, jqXHR) {
    location.href = "piyoshogi://?url=" + data;
  }).fail(function(jqXHR, textStatus, errorThrown) {
    console.log(textStatus);
    alert("連携に失敗しました。");
  });
}
function again(){
  display_form_button();
  clear_form_inner();
  hide_result();
}
function file_upload(){
    // 値の格納
    get_js_variable();
    // 結果の非表示
    // ぐるぐるを表示
    before_reco();
    // フォームデータを取得
    var result_place = document.getElementById('board');
    var formdata = new FormData($('#myform').get(0));
    formdata.set('upfile',blobdata)    

    // POSTでアップロード
    $.ajax({
        url : "https://mxgnhndhfb.ap-northeast-1.awsapprunner.com/recognize",
        type : "POST",
        data : formdata,
        cache       : false,
        contentType : false,
        processData : false,
        dataType    : "json",
        success: function(data, textStatus, jqXHR){
          // alert(data);
          result_json = data;//.replace(/<br>/g, '\n');
          result_place.textContent = json_to_kif(result_json);
          // disp_result(result);
          // disp_koma(result);
          disp_koma_json(result_json);
          // ぐるぐるの非表示
          // 結果部分の表示
          after_reco();
        },
        error: function(XMLHttpRequest, textStatus, errorThrown){
          console.log(textStatus)
          // うまくいかなかった表示
          reco_err();
        }
    })
}