# 検証の**正解**を作るところ。手合割14種それぞれで対局を1つ作り、
# 指し手(USI)と各局面のSFENを python-shogi の値そのままで書き出す。
#
# ・手合割の表は python-shogi の `shogi.KIF.Parser.HANDYCAP_SFENS` を直接引く
#   (study.html の `HANDICAP_SFENS` と食い違ったら、それ自体が不合格になる)
# ・指し手は合法手からの乱数だが**種は固定**なので、何度走らせても同じ棋譜になる。
#   乱数にするのは、実戦の定跡より駒取り・成り・打ちが濃く出て盤の帳尻が厳しく試されるため
# ・出力は標準出力のJSON。test.mjs / compat.mjs がその場で呼ぶ(結果は置かない)
import json, random, shogi
import shogi.KIF as KIF

cases = []
names = [n for n, v in KIF.Parser.HANDYCAP_SFENS.items() if v]
for idx, name in enumerate(names):
    sfen = KIF.Parser.HANDYCAP_SFENS[name]
    # 種は手合割の並び順から作る(Pythonの hash() はプロセスごとに変わるので使わない)
    rnd = random.Random(1000 + idx)
    b = shogi.Board(sfen)
    moves, sfens = [], [b.sfen()]
    for _ in range(60):
        legal = list(b.legal_moves)
        if not legal or b.is_game_over():
            break
        mv = rnd.choice(legal)
        b.push(mv)
        moves.append(mv.usi())
        sfens.append(b.sfen())
    cases.append({'name': name, 'startSfen': sfen, 'moves': moves, 'sfens': sfens})
print(json.dumps(cases, ensure_ascii=False))
