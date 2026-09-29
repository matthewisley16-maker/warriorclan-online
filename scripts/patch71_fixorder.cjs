// patch71_fixorder.cjs — colorpoint pattern must not use later-declared vars
const fs = require("fs");
const path = "src/game/draw.ts";
let S = fs.readFileSync(path, "utf8");
const R = (needle, replacement, label) => {
  if (S.split(needle).length !== 2) { console.error(`ABORT: ${label}`); process.exit(1); }
  S = S.replace(needle, replacement);
  console.log(`ok [${label}]`);
};
R(
  `  } else if (skin.pattern === "colorpoint") {
    ctx.fillStyle = skin.furDark;
    // dark ears, legs, tail (points)
    ctx.beginPath();
    ctx.moveTo(headX - 5.5 + earDx, headY - 3.5);
    ctx.lineTo(headX - 3 + earDx, headY - earH);
    ctx.lineTo(headX - 0.5 + earDx, headY - 4.5);
    ctx.closePath();
    ctx.moveTo(headX + 1, headY - 5);
    ctx.lineTo(headX + 3.5 - earDx, headY - earH - 0.5);
    ctx.lineTo(headX + 6 - earDx, headY - 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-9, pose === "walk" ? -1.5 : -2, 4, 3.5);
    ctx.fillRect(5, pose === "walk" ? -1.5 : -2, 4, 3.5);
  }`,
  `  } else if (skin.pattern === "colorpoint") {
    ctx.fillStyle = skin.furDark;
    // dark ears (computed locally — head coords are declared later), legs
    const cpx = pose === "sit" || pose === "groom" ? 4 : 9;
    const cpy = pose === "swim" ? -8 : pose === "sit" ? -16 : pose === "sleep" ? -8 : pose === "crouch" ? -8 : -11;
    const eH = skin.ears === "tall" ? 12 : skin.ears === "fold" ? 6 : 10;
    ctx.beginPath();
    ctx.moveTo(cpx - 5.5, cpy - 3.5);
    ctx.lineTo(cpx - 3, cpy - eH);
    ctx.lineTo(cpx - 0.5, cpy - 4.5);
    ctx.closePath();
    ctx.moveTo(cpx + 1, cpy - 5);
    ctx.lineTo(cpx + 3.5, cpy - eH - 0.5);
    ctx.lineTo(cpx + 6, cpy - 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-9, pose === "walk" ? -1.5 : -2, 4, 3.5);
    ctx.fillRect(5, pose === "walk" ? -1.5 : -2, 4, 3.5);
  }`,
  "colorpoint local vars",
);
fs.writeFileSync(path, S);
console.log("patch71 complete");
