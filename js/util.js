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
function set_camera(){
    $('#upfile').attr('capture','camera');
}
function set_library(){
    $('#upfile').removeAttr('capture');
}

function clear_form_inner(){
    var form = document.getElementById('myform');
    var pic1_p = document.getElementById('pic1_parent');
    var pic1 = document.getElementById('pic1');
    form.reset();
    pic1.style.backgroundImage = "initial";
    pic1.style.height = "0px";
    pic1_p.style.height = "0px";
    $('#pic1').attr('src','');
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
    var reco_err = document.getElementById('reco_err_img');
    kekka_text.style.display="none";
    // result_place.style.display="none";
    result_img.style.display="none";
    copy_btn.style.display="none";
    again.style.display="none";
    reco_err.style.display="none";
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

function koma2index(string){
    var koma = ["歩","香","桂","銀","金","角","飛"];
    return koma.indexOf(string)
}

function kanji2int(kanji){
    var kansuuji = ["","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八"];
    return kansuuji.indexOf(kanji)+1
}

function int2kanji(kazu){
    var kansuuji = ["","","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八"];
    return kansuuji[kazu]
}

function disp_mochigoma_sub(sengo,string,kazu,result_json){
    var sengo_int = 0;
    if (sengo == "sente_mochi"){sengo_int = 1;}
    var mochigoma = document.getElementsByClassName('mochigoma-list')[sengo_int].children[koma2index(string)].children[0];
    result_json[sengo][string] = int2kanji(kazu);
    mochigoma.children[1].innerHTML = String(kazu); // ここの1はimgタグの次のpってこと
    if (kazu == 0){mochigoma.children[0].style.opacity=0.5; delete result_json[sengo][string];}
    else {mochigoma.children[0].style.opacity=1;}
    return result_json
}

function reset_mochigoma(){
    var komas = ["歩","香","桂","銀","金","角","飛"];
    for (var sengo_int=0;sengo_int<2;sengo_int++){
        for (var string of komas){
            var mochigoma = document.getElementsByClassName('mochigoma-list')[sengo_int].children[koma2index(string)].children[0];
            mochigoma.children[1].innerHTML = String(0); // ここの1はimgタグの次のpってこと
            mochigoma.children[0].style.opacity=0.5;
        }
    }
}

function disp_koma_json(result_json){
    var table = document.getElementById('board_koma');
    var ban_result = result_json['ban_result'];
    for(i=0;i<9;i++){
        // i = 行番号
        for(j=0;j<9;j++){
            // j = 列番号
            var koma_place = table.rows[i].cells[j].children[0];
            var koma_img = "../img/koma/"+ban_result["\""+String(j)+String(i)+"\""].trim()+".png";
            koma_place.src = koma_img;
        }
    }
    reset_mochigoma();
    var gote_mochi = result_json['gote_mochi'];
    for (koma in gote_mochi) { result_json = disp_mochigoma_sub("gote_mochi",koma,kanji2int(gote_mochi[koma]),result_json); }
    var sente_mochi = result_json['sente_mochi'];
    for (koma in sente_mochi) { result_json = disp_mochigoma_sub("sente_mochi",koma,kanji2int(sente_mochi[koma]),result_json); }
}
function sort_mochigoma(mochi){
    var sorted = {};
    if('飛' in mochi){sorted['飛']=mochi['飛'];}
    if('角' in mochi){sorted['角']=mochi['角'];}
    if('金' in mochi){sorted['金']=mochi['金'];}
    if('銀' in mochi){sorted['銀']=mochi['銀'];}
    if('桂' in mochi){sorted['桂']=mochi['桂'];}
    if('香' in mochi){sorted['香']=mochi['香'];}
    if('歩' in mochi){sorted['歩']=mochi['歩'];}
    return sorted
}
function json_to_kif(result_json){
    var kansuuji    = ["一","二","三","四","五","六","七","八","九"];
    var kif_text    = "";
    var ban_result  = result_json['ban_result'];
    var sente_mochi = sort_mochigoma(result_json['sente_mochi']);
    var gote_mochi  = sort_mochigoma(result_json['gote_mochi']);
    var teban       = result_json['teban'];
    
    kif_text += "後手の持駒：";
    for (koma in gote_mochi)  {kif_text+=koma+gote_mochi[koma] +"　"};
    kif_text += "\n";
    kif_text += "  ９ ８ ７ ６ ５ ４ ３ ２ １\n";
    kif_text += "+---------------------------+\n";

    // i = 行番号 // j = 列番号
    for(i=0;i<9;i++){
        kif_text += "|";
        for(j=0;j<9;j++){kif_text += ban_result["\""+String(j)+String(i)+"\""];}
        kif_text += "|"+kansuuji[i]+"\n";
    }

    kif_text += "+---------------------------+\n"
    kif_text += "先手の持駒："
    for (koma in sente_mochi) {kif_text+=koma+sente_mochi[koma]+"　"}
    kif_text += "\n"
    
    kif_text += "\n"
    kif_text += teban
    return kif_text
}
function json_to_sfen(result_json){
    var tebans      = {"先手番":"b", "後手番":"w"};
    var kazus       = {};
    var kansuuji    = ["","","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八"];
    for (i=0;i<19;i++) {kazus[kansuuji[i]] = String(i);}
    var komas       = {};
    var kifkomas    = [" ・"," 歩"," 香"," 桂"," 銀"," 金"," 角"," 飛"," 玉",
                       " と"," 杏"," 圭"," 全"," 馬"," 龍",
                       "v歩","v香","v桂","v銀","v金","v角","v飛","v玉",
                       "vと","v杏","v圭","v全","v馬","v龍"];
    var sfenkomas   = ["1","P","L","N","S","G","B","R","K",
                       "+P","+L","+N","+S","+B","+R",
                       "p","l","n","s","g","b","r","k",
                       "+p","+l","+n","+s","+b","+r"];
    for (i=0;i<29;i++) {komas[kifkomas[i]] = sfenkomas[i];}
    var kif_text    = "";
    var ban_result  = result_json['ban_result'];
    var sente_mochi = sort_mochigoma(result_json['sente_mochi']);
    var gote_mochi  = sort_mochigoma(result_json['gote_mochi']);
    var teban       = result_json['teban'];

    // i = 行番号 // j = 列番号
    for(i=0;i<9;i++){
        var before_koma = "";
        for(j=0;j<9;j++){
            koma = komas[ban_result["\""+String(j)+String(i)+"\""]];
            if ((before_koma == "1") && (koma == "1")){
                space = String(Number(kif_text.slice(-1)) + 1);
                kif_text = kif_text.slice(0,-1);
                kif_text += space;
            }else{
                kif_text += koma;
            }
            before_koma = koma;
        }
        kif_text += "/";
    }
    // 最後のスライスを消す
    kif_text = kif_text.slice(0,-1);

    // 手番
    kif_text += " " + tebans[teban];

    // 持ち駒
    kif_text += " ";
    for (koma in sente_mochi) {
        koma_kazu = kazus[sente_mochi[koma]];
        if (koma_kazu == "1"){koma_kazu = "";}
        kif_text+=koma_kazu+komas[" "+koma];
    }
    for (koma in gote_mochi) {
        koma_kazu = kazus[gote_mochi[koma]];
        if (koma_kazu == "1"){koma_kazu = "";}
        kif_text+=koma_kazu+komas[" "+koma];
    }
    if (kif_text.slice(-1) == " ")  {kif_text+="-"}

    // 何手目
    kif_text += " 1"
    
    return kif_text
}

// 結果編集用関数群
function get_result_img(fix_place){
    return document.getElementById('board_koma').children[0].rows[Number(fix_place.charAt(1))].cells[Number(fix_place.charAt(0))];
}
function set_color(fix_place){
    var result_img = get_result_img(fix_place);
    result_img.style.backgroundColor = 'skyblue';
}
function set_uncolor(fix_place){
    var result_img = get_result_img(fix_place);
    result_img.style.backgroundColor = 'transparent';
}
function disp_imglist(){
    var fix_imglist = document.getElementsByClassName('horizontal-list')[0];
    fix_imglist.style.display = "block";
}
function close_imglist(){
    var fix_imglist = document.getElementsByClassName('horizontal-list')[0];
    fix_imglist.style.display = "none";
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

function reco_err(){
    var again = document.getElementById('again');
    var guruguru = document.getElementById('guruguru');
    var reco_err = document.getElementById('reco_err_img');
    guruguru.style.display="none";
    again.style.display="block";
    reco_err.style.display="block";
}