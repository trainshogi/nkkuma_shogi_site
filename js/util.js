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
    form.style.display = "none";
    form.style.height = "0px";
}
function display_form_button(){
    var again = document.getElementById('again');
    var form = document.getElementById('myform');
    form.style.display = "flex";
    form.style.height = "initial";
    again.style.display = "none";
}
function before_reco(){
    var result_place = document.getElementById('board');
    var kekka_text = document.getElementById('kekka_text');
    var again = document.getElementById('again');
    var guruguru = document.getElementById('guruguru');
    kekka_text.style.display="none";
    result_place.style.display="none";
    again.style.display="none";
    guruguru.style.display="block";
    hide_form_button();        
}
function after_reco(){
    var result_place = document.getElementById('board');
    var kekka_text = document.getElementById('kekka_text');
    var again = document.getElementById('again');
    var guruguru = document.getElementById('guruguru');
    guruguru.style.display="none";
    kekka_text.style.display="block";
    result_place.style.display="block";
    again.style.display="block";
}