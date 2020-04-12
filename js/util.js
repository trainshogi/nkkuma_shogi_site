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
    var link_btn = document.getElementById('link_btn');
    var kekka_text = document.getElementById('kekka_text');
    var again = document.getElementById('again');    
    var reco_err = document.getElementById('reco_err_img');
    kekka_text.style.display="none";
    // result_place.style.display="none";
    result_img.style.display="none";
    copy_btn.style.display="none";
    link_btn.style.display="none";
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

function alphabet2index(string){
    var koma = ["fu","ky","ke","gi","ki","ka","hi"];
    return koma.indexOf(string)
}

function alphabet2kanji(koma){
    var alphabet = ["* ","fu","ky","ke","gi","ki","ka","hi","ou","to","ny","nk","ng","um","ry"];
    var kanji    = ["・","歩","香","桂","銀","金","角","飛","玉","と","杏","圭","全","馬","龍"];
    return kanji[alphabet.indexOf(koma)];
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
    var mochigoma = document.getElementsByClassName('mochigoma-list')[sengo_int].children[alphabet2index(string)].children[0];
    result_json[sengo][string] = kazu;
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
    // i = 行番号 // j = 列番号
    for(i=0;i<9;i++){
        for(j=0;j<9;j++){
            var koma_place = table.rows[i].cells[j].children[0];
            let koma = ban_result[String(9-j)+String(i+1)];
            if(typeof koma === "undefined"){koma = " * ";}
            let koma_img = "../img/koma/"+koma.charAt(0).trim()+alphabet2kanji(koma.substr(1))+".png";
            koma_place.src = koma_img;
        }
    }
    reset_mochigoma();
    var gote_mochi = result_json['gote_mochi'];
    for (koma in gote_mochi) { result_json = disp_mochigoma_sub("gote_mochi",koma,gote_mochi[koma],result_json); }
    var sente_mochi = result_json['sente_mochi'];
    for (koma in sente_mochi) { result_json = disp_mochigoma_sub("sente_mochi",koma,sente_mochi[koma],result_json); }
}
function sort_mochigoma(mochi){
    var sorted = {};
    if('hi' in mochi){sorted['hi']=mochi['hi'];}
    if('ka' in mochi){sorted['ka']=mochi['ka'];}
    if('ki' in mochi){sorted['ki']=mochi['ki'];}
    if('gi' in mochi){sorted['gi']=mochi['gi'];}
    if('ke' in mochi){sorted['ke']=mochi['ke'];}
    if('ky' in mochi){sorted['ky']=mochi['ky'];}
    if('fu' in mochi){sorted['fu']=mochi['fu'];}
    return sorted
}
function json_to_kif(result_json){
    var kansuuji    = ["一","二","三","四","五","六","七","八","九"];
    var tebans      = {"sente":"先手番", "gote":"後手番"};
    var kif_text    = "";
    var ban_result  = result_json['ban_result'];
    var sente_mochi = sort_mochigoma(result_json['sente_mochi']);
    var gote_mochi  = sort_mochigoma(result_json['gote_mochi']);
    var teban       = result_json['teban'];
    
    kif_text += "後手の持駒：";
    for (koma in gote_mochi)  {kif_text+=alphabet2kanji(koma)+int2kanji(gote_mochi[koma])+"　"};
    kif_text += "\n";
    kif_text += "  ９ ８ ７ ６ ５ ４ ３ ２ １\n";
    kif_text += "+---------------------------+\n";

    // i = 行番号 // j = 列番号
    for(i=0;i<9;i++){
        kif_text += "|";
        for(j=0;j<9;j++){
            let koma = ban_result[String(9-j)+String(i+1)];
            if(koma){kif_text += koma.charAt(0) + alphabet2kanji(koma.substr(1));}
            else    {kif_text += " ・";}
        }
        kif_text += "|"+kansuuji[i]+"\n";
    }

    kif_text += "+---------------------------+\n"
    kif_text += "先手の持駒："
    for (koma in sente_mochi) {kif_text+=alphabet2kanji(koma)+int2kanji(sente_mochi[koma])+"　"}
    kif_text += "\n"
    
    kif_text += "\n"
    kif_text += tebans[teban];
    return kif_text
}
function json_to_sfen(result_json){
    var tebans      = {"sente":"b", "gote":"w"};
    var komas       = {};
    var kifkomas    = [" * "," fu"," ky"," ke"," gi"," ki"," ka"," hi"," ou",
                       " to"," ny"," nk"," ng"," um"," ry",
                       "vfu","vky","vke","vgi","vki","vka","vhi","vou",
                       "vto","vny","vnk","vng","vum","vry"];
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
            let tmpkoma = ban_result[String(9-j)+String(i+1)];
            if(tmpkoma){koma += komas[tmpkoma];}
            else       {koma += komas[" * "];}
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
        koma_kazu = String(sente_mochi[koma]);
        if (koma_kazu == "1"){koma_kazu = "";}
        kif_text+=koma_kazu+komas[" "+koma];
    }
    for (koma in gote_mochi) {
        koma_kazu = String(gote_mochi[koma]);
        if (koma_kazu == "1"){koma_kazu = "";}
        kif_text+=koma_kazu+komas["v"+koma];
    }
    if (kif_text.slice(-1) == " ")  {kif_text+="-"}

    // 何手目
    kif_text += " 1"
    
    return kif_text
}
function sfen_to_kento(sfen){
    return sfen.split("+").join("%2B");
}
function kif_to_url(kif){
    // GETでアップロード
    return $.ajax({
        url : "https://us-central1-shogiban2kif.cloudfunctions.net/save_kif",
        type : "GET",
        data : {"message": kif}
    });
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
    var link_btn = document.getElementById('link_btn');
    var kekka_text = document.getElementById('kekka_text');
    var again = document.getElementById('again');
    var guruguru = document.getElementById('guruguru');
    guruguru.style.display="none";
    kekka_text.style.display="block";
    // result_place.style.display="block";
    result_img.style.display="block";
    copy_btn.style.display="block";
    link_btn.style.display="block";
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