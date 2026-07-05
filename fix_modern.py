import re

with open("public/css/modern.css", "r") as f:
    css = f.read()

replacement = """
#board_koma {
  position: absolute !important;
  top: 11% !important;
  left: 3% !important;
  width: 93.5% !important;
  height: 85.5% !important; /* テーブル高さを固定し、はみ出しを防ぐ */
  table-layout: fixed !important;
  border-collapse: collapse !important; /* Prevent border spacing issues */
}

#board_koma tr {
  height: 11.11% !important; /* 100% / 9 */
}

#board_koma tr td {
  padding: 0 !important;
  height: 11.11% !important;
  position: relative !important; /* For absolute child */
}

#board_koma tr td img {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain;
  object-position: center bottom;
}
"""

css = re.sub(
    r"#board_koma \{.*?object-position: center bottom;\n\}",
    replacement.strip(),
    css,
    flags=re.DOTALL
)

with open("public/css/modern.css", "w") as f:
    f.write(css)
