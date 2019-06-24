$(function(){
  $("#board_img").load("shogiban.html");
});

var fix_place = '00';

function ban_click(string){
  fix_place = string;
  var result_img = document.getElementById('board_koma').children[0].rows[Number(fix_place.charAt(1))].cells[8-Number(fix_place.charAt(0))];
  var fix_imglist = document.getElementsByClassName('horizontal-list')[0];
  result_img.style.backgroundColor = 'skyblue';
  fix_imglist.style.display = "block"
}

function fix(string){
  var result_img = document.getElementById('board_koma').children[0].rows[Number(fix_place.charAt(1))].cells[8-Number(fix_place.charAt(0))];
  var fix_imglist = document.getElementsByClassName('horizontal-list')[0];
  // fix
  result_json["\""+fix_place+"\""] = string;
  result_img.children[0].src = "../img/koma/"+string+".png";
  result_place.textContent = json_to_kif(result_json);

  result_img.style.backgroundColor = 'transparent';
  fix_imglist.style.display = "none";
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