// 旧 study.html(origin/master)と新しい study.html で、
// **今までの #u=(指し手だけ)** が1局面もずれないことを見る
// 旧版(origin/master 等)と新版の study.html を並べて、
// **今までの入口が1文字も変わっていない**ことを見る。
//
//   使い方: git show origin/master:public/study.html > /tmp/study-old.html
//           node compat.mjs /tmp/study-old.html ../../public/study.html
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from './dom.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OLD = process.argv[2], NEW = process.argv[3];
const cases = JSON.parse(execFileSync('python3', [path.join(HERE, 'gen.py')],
                                      { encoding: 'utf8', maxBuffer: 1 << 24 }));
const hirate = cases.find(c => c.name === '平手');
let diffs = 0, n = 0;

// (a) 指し手だけの #u=
{
  const a = run(OLD, { hash: '#u=' + hirate.moves.join('_') });
  const b = run(NEW, { hash: '#u=' + hirate.moves.join('_') });
  n++;
  const sa = a.viewer.positions.map((p, i) => a.toSfen(p, i + 1));
  const sb = b.viewer.positions.map((p, i) => b.toSfen(p, i + 1));
  if (JSON.stringify(sa) !== JSON.stringify(sb)) { diffs++; console.log('NG: #u= 指し手だけ'); }
  if (a.el('kif-in').value !== b.el('kif-in').value) { diffs++; console.log('NG: 貼り付け欄のKIF'); }
}
// (b) KIFの手合割11種(旧ページが持っていた表)で開始局面が変わっていないか
const OLDNAMES = ['平手','香落ち','右香落ち','角落ち','飛車落ち','飛香落ち','二枚落ち',
                  '四枚落ち','六枚落ち','八枚落ち','十枚落ち'];
{
  const a = run(OLD), b = run(NEW);
  for (const name of OLDNAMES) {
    n++;
    const x = a.toSfen(a.startPosFor(name), 1), y = b.toSfen(b.startPosFor(name), 1);
    if (x !== y) { diffs++; console.log(`NG: ${name} ${x} != ${y}`); }
  }
  // 旧ページで駒落ちの #u= がどうなっていたか(記録用)
  const c = cases.find(z => z.name === '六枚落ち');
  const usi = ('position sfen ' + c.startSfen + ' moves ' + c.moves.join(' ')).split(' ').join('_');
  const oldTry = run(OLD, { hash: '#u=' + usi });
  console.log('旧ページに駒落ちUSIを渡すと:', oldTry.viewer.positions ? '並んでしまう(誤り)' : '読めない(false)');
  const oldPlain = run(OLD, { hash: '#u=' + c.moves.join('_') });
  console.log('旧ページに駒落ちの指し手だけを渡すと:',
    oldPlain.viewer.positions
      ? `平手初形から ${oldPlain.viewer.positions.length - 1}/${c.moves.length} 手だけ並ぶ(別の一局)`
      : '読めない(false)');
}
console.log(`compat: ${n} 件中 ${diffs} 件の差分`);
process.exit(diffs ? 1 : 0);
