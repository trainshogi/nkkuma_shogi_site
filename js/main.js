$(function(){
  $("#board_img").load("shogiban.html");
});

var fix_place = '00';

function ban_click(string){
  fix_place = String(8-Number(string.charAt(0)))+String(Number(string.charAt(1)));
  var result_img = document.getElementById('board_koma').children[0].rows[Number(fix_place.charAt(1))].cells[Number(fix_place.charAt(0))];
  var fix_imglist = document.getElementsByClassName('horizontal-list')[0];
  result_img.style.backgroundColor = 'skyblue';
  fix_imglist.style.display = "block"
}

function fix(string){
  var result_img = document.getElementById('board_koma').children[0].rows[Number(fix_place.charAt(1))].cells[Number(fix_place.charAt(0))];
  var fix_imglist = document.getElementsByClassName('horizontal-list')[0];
  var result_place = document.getElementById('board');
  // fix
  result_json["ban_result"]["\""+fix_place+"\""] = string;
  result_img.children[0].src = "../img/koma/"+string+".png";
  result_place.textContent = json_to_kif(result_json);

  result_img.style.backgroundColor = 'transparent';
  fix_imglist.style.display = "none";
}

function fix_mochigoma(method,sengo,string){
  var kazu = 1; // == real num
  var koma = ["歩","香","桂","銀","金","角","飛"]
  var kansuuji = ["","","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八"];
  var result_place = document.getElementById('board');
  if(method=='add'){
    if (sengo=="gote"){// gote
      if (result_json['gote_mochi'][string]){
        if (result_json['gote_mochi'][string] == ""){kazu == 2;}
        else {kazu=(kansuuji.indexOf(result_json['gote_mochi'][string])+1)%19;}}
      result_json['gote_mochi'][string] = kansuuji[kazu];

    }
    else{              // sente
      var mochigoma = document.getElementsByClassName('mochigoma-list')[0].children[koma.indexOf(string)].children[0];
      if (result_json['sente_mochi'][string]){
        if (result_json['sente_mochi'][string] == ""){kazu == 2;}
        else {kazu=(kansuuji.indexOf(result_json['sente_mochi'][string])+1)%19;}}
      result_json['sente_mochi'][string] = kansuuji[kazu];
      mochigoma.children['p'][0].data = String(kazu);
      if (kazu == 0){mochigoma.children('img')[0].style.opacity=0.5;}
      else {mochigoma.children('img')[0].style.opacity=1;}
    }
  }
  result_place.textContent = json_to_kif(result_json);
}

function clip_text(){
  var result_txt = document.getElementById('board');
  if(execCopy(result_txt.value)){
    alert('コピーできました');
  }
  else {
    alert('このブラウザでは対応していません');
  }
}
function again(){
  display_form_button();
  clear_form_inner();
  hide_result();
}
function file_upload(){
    // 結果の非表示
    // ぐるぐるを表示
    before_reco();
    // フォームデータを取得
    var result_place = document.getElementById('board');
    var formdata = new FormData($('#myform').get(0));        

    // POSTでアップロード
    $.ajax({
        url : "https://shogiapi.nkkuma.tokyo/recognize",
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
        }
    })
}