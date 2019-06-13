function init_table(){
    var table = document.getElementById('board_koma');
    for(var i=0;i<9;i++){
        var row = table.insertRow(-1);
        // styleはCSSで設定しておく前提
        for(var j=0;j<9;j++){
            var cell = row.insertCell(-1);
            cell.style.source = "img/koma/・.png";
        }
    }
}