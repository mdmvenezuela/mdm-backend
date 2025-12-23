const bcrypt = require('bcrypt');

const password = process.argv[2];

if (!password) {
  console.error('❌ Uso: node hashPassword.js TU_CONTRASEÑA');
  process.exit(1);
}

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('❌ Error generando hash:', err);
    return;
  }
  console.log('\n✅ Hash generado exitosamente:\n');
  console.log(hash);
  console.log('\nAhora ejecuta este SQL en PostgreSQL:\n');
  console.log(`UPDATE super_admins SET password_hash = '${hash}' WHERE username = 'tuusuario';`);
  console.log('\n');
});