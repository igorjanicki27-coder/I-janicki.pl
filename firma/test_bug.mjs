const x = [1];
const y = `${x.map(v => {
    return `
    ${v}
  `).join("")}`;
console.log("OK");
