const hexHash = "ee5250861a0d8ff0ee610c1fc39f20e703c639e8fd60c1655b9880947dc4e869";
const base64Safe = Buffer.from(hexHash, 'hex')
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

console.log(base64Safe);