$(function(){
  $("#board_img").load("shogiban.html");
});

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
          var result = data;//.replace(/<br>/g, '\n');
          result_place.textContent = json_to_kif(result);
          // disp_result(result);
          // disp_koma(result);
          disp_koma_json(result);
          // ぐるぐるの非表示
          // 結果部分の表示
          after_reco();
        },
        error: function(XMLHttpRequest, textStatus, errorThrown){
          console.log(textStatus)
        }
    })
}