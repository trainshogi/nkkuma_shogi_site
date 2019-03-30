// 外部サイトからの引用
function execCopy(string){
    // 空div 生成
    var tmp = document.createElement("div");
    // 選択用のタグ生成
    var pre = document.createElement('pre');
    // 親要素のCSSで user-select: none だとコピーできないので書き換える
    pre.style.webkitUserSelect = 'auto';
    pre.style.userSelect = 'auto';
    tmp.appendChild(pre).textContent = string;
    // 要素を画面外へ
    var s = tmp.style;
    s.position = 'fixed';
    s.right = '200%';
    // body に追加
    document.body.appendChild(tmp);
    // 要素を選択
    document.getSelection().selectAllChildren(tmp);
    // クリップボードにコピー
    var result = document.execCommand("copy");
    // 要素削除
    document.body.removeChild(tmp);
    return result;
}
function splitByLength(str, length) {
    var resultArr = [];
    if (!str || !length || length < 1) {
        return resultArr;
    }
    var index = 0;
    var start = index;
    var end = start + length;
    while (start < str.length) {
        resultArr[index] = str.substring(start, end);
        index++;
        start = end;
        end = start + length;
    }
    return resultArr;
}

// 自作関数
function clear_form_inner(){
    var form = document.getElementById('myform');
    var pic1_p = document.getElementById('pic1_parent');
    var pic1 = document.getElementById('pic1');
    form.reset();
    pic1.style.backgroundImage = "initial";
    pic1.style.height = "0px";
    pic1_p.style.height = "0px";
}
function hide_form_button(){
    var form = document.getElementById('myform');
    var clear = document.getElementById('back');
    form.style.display = "none";
    form.style.height = "0px";
    clear.style.display = "none";
}
function display_form_button(){
    var again = document.getElementById('again');
    var form = document.getElementById('myform');
    var clear = document.getElementById('back');
    form.style.display = "flex";
    form.style.height = "initial";
    again.style.display = "none";
    clear.style.display = "block";
}
function hide_result(){
    // var result_place = document.getElementById('board');
    var result_img = document.getElementById('board_img');
    var copy_btn = document.getElementById('copy_btn');
    var kekka_text = document.getElementById('kekka_text');
    var again = document.getElementById('again');
    kekka_text.style.display="none";
    // result_place.style.display="none";
    result_img.style.display="none";
    copy_btn.style.display="none";
    again.style.display="none";
}
function disp_koma(string){
    var table = document.getElementById('board_koma');
    lines = string.split('\n');
    for(i=0;i<lines.length;i++){
        if(i<3){continue}
        else if(i>11){break}
        else{
            komas = splitByLength(lines[i].substr(1,18),2);
            for(j=0;j<9;j++){
                var koma_place = table.rows[i-3].cells[j].children[0];
                var koma_img = "../img/koma/"+komas[j].trim()+".png";
                koma_place.src = koma_img;
            }
        }
    }
}
function before_reco(){
    var guruguru = document.getElementById('guruguru');
    hide_result();
    hide_form_button();        
    guruguru.style.display="block";
}
function after_reco(){
    // var result_place = document.getElementById('board');
    var result_img = document.getElementById('board_img');
    var copy_btn = document.getElementById('copy_btn');
    var kekka_text = document.getElementById('kekka_text');
    var again = document.getElementById('again');
    var guruguru = document.getElementById('guruguru');
    guruguru.style.display="none";
    kekka_text.style.display="block";
    // result_place.style.display="block";
    result_img.style.display="block";
    copy_btn.style.display="block";
    again.style.display="block";
}