// ===================================================
// TEST DE CONFIGURACIÓN SMTP - GOOGLE WORKSPACE
// Archivo: test-smtp.js
// ===================================================

const nodemailer = require('nodemailer');

// ⚠️ REEMPLAZA ESTOS VALORES CON TU CONFIGURACIÓN
const config = {
  host: 'smtp.gmail.com',
  port: 587,
  user: 'admin@solvenca.lat',
  pass: 'mvlb aoxo toeo cnye' // ← Cambia esto
};

console.log('🧪 Iniciando prueba de configuración SMTP...\n');
console.log('📧 Configuración:');
console.log('   Host:', config.host);
console.log('   Port:', config.port);
console.log('   User:', config.user);
console.log('   Pass:', config.pass.substring(0, 4) + '****' + config.pass.substring(config.pass.length - 4));
console.log('');

// Crear transportador
const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: false,
  auth: {
    user: config.user,
    pass: config.pass
  },
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }
});

// Test 1: Verificar conexión
console.log('🔍 Test 1: Verificando conexión con el servidor SMTP...');

transporter.verify(function(error, success) {
  if (error) {
    console.log('❌ Error de conexión:', error.message);
    console.log('');
    console.log('💡 Posibles soluciones:');
    console.log('   1. Verifica que la contraseña de aplicación sea correcta');
    console.log('   2. Asegúrate de tener activada la verificación en 2 pasos');
    console.log('   3. Genera una nueva contraseña de aplicación en:');
    console.log('      https://myaccount.google.com/apppasswords');
    console.log('   4. Verifica que no haya espacios extra en la contraseña');
    process.exit(1);
  } else {
    console.log('✅ Conexión exitosa con el servidor SMTP');
    console.log('');
    
    // Test 2: Enviar email de prueba
    console.log('📨 Test 2: Enviando email de prueba...');
    
    const mailOptions = {
      from: `"Test SMDM" <${config.user}>`,
      to: config.user, // Te envía el email a ti mismo
      subject: '✅ Test de configuración SMTP - SMDM',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              padding: 20px;
              background: white;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
              margin: -20px -20px 20px -20px;
            }
            .success {
              background: #d4edda;
              border: 1px solid #c3e6cb;
              color: #155724;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .info {
              background: #f8f9fa;
              padding: 15px;
              border-left: 4px solid #667eea;
              margin: 20px 0;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Configuración SMTP Exitosa</h1>
            </div>
            
            <div class="success">
              <strong>¡Felicitaciones!</strong> Tu configuración de Google Workspace SMTP está funcionando correctamente.
            </div>
            
            <div class="info">
              <strong>📋 Detalles de la prueba:</strong><br>
              <strong>Servidor:</strong> ${config.host}:${config.port}<br>
              <strong>Usuario:</strong> ${config.user}<br>
              <strong>Fecha:</strong> ${new Date().toLocaleString('es-VE')}<br>
              <strong>Estado:</strong> Operacional ✅
            </div>
            
            <p>El sistema de emails del landing page de SMDM está listo para funcionar.</p>
            
            <p>Cuando alguien complete el formulario de contacto en <strong>www.solvenca.lat</strong>, recibirás notificaciones automáticas en este correo.</p>
            
            <div class="footer">
              <p>Test generado por test-smtp.js<br>
              SMART SOLUCIONES TECNOLÓGICAS C.A.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
¡Configuración SMTP Exitosa!

Tu configuración de Google Workspace SMTP está funcionando correctamente.

Detalles de la prueba:
- Servidor: ${config.host}:${config.port}
- Usuario: ${config.user}
- Fecha: ${new Date().toLocaleString('es-VE')}
- Estado: Operacional ✅

El sistema de emails del landing page de SMDM está listo para funcionar.

---
SMART SOLUCIONES TECNOLÓGICAS C.A.
      `.trim()
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('❌ Error al enviar email:', error.message);
        console.log('');
        console.log('💡 Verifica:');
        console.log('   1. Que el correo', config.user, 'exista');
        console.log('   2. Que tengas permisos para enviar emails');
        process.exit(1);
      } else {
        console.log('✅ Email enviado exitosamente!');
        console.log('   Message ID:', info.messageId);
        console.log('   Response:', info.response);
        console.log('');
        console.log('🎉 ¡PRUEBA COMPLETADA CON ÉXITO!');
        console.log('');
        console.log('📬 Revisa tu bandeja de entrada en:', config.user);
        console.log('   (También revisa la carpeta de Spam por si acaso)');
        console.log('');
        console.log('✅ Tu configuración SMTP está lista para usarse en el backend');
        console.log('');
        process.exit(0);
      }
    });
  }
});

// Timeout de seguridad
setTimeout(() => {
  console.log('⏱️  Timeout: La prueba está tomando demasiado tiempo');
  console.log('Verifica tu conexión a internet');
  process.exit(1);
}, 30000); // 30 segundos