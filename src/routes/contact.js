const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer'); // Para enviar emails

// Configuración del transportador de email
// IMPORTANTE: Configura estas variables de entorno en tu .env
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER, // Tu email
    pass: process.env.SMTP_PASS  // Tu contraseña o app password
  }
});

/**
 * POST /api/contact
 * Endpoint para recibir mensajes del formulario de contacto
 */
router.post('/contact', async (req, res) => {
  try {
    const { name, email, company, phone, inquiry, message } = req.body;

    // Validación básica
    if (!name || !email || !company || !inquiry || !message) {
      return res.status(400).json({ 
        error: 'Por favor completa todos los campos requeridos' 
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Por favor ingresa un email válido' 
      });
    }

    // Guardar en base de datos (opcional)
    // const contact = await Contact.create({
    //   name, email, company, phone, inquiry, message,
    //   created_at: new Date()
    // });

    // Preparar el email
    const inquiryTypes = {
      pilot: 'Pilot Program',
      demo: 'Request Demo',
      partnership: 'Partnership Opportunity',
      general: 'General Inquiry'
    };

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #667eea; }
          .value { margin-top: 5px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>📧 Nuevo Mensaje de Contacto - SMDM</h2>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">👤 Nombre:</div>
              <div class="value">${name}</div>
            </div>
            
            <div class="field">
              <div class="label">📧 Email:</div>
              <div class="value"><a href="mailto:${email}">${email}</a></div>
            </div>
            
            <div class="field">
              <div class="label">🏢 Empresa:</div>
              <div class="value">${company}</div>
            </div>
            
            ${phone ? `
              <div class="field">
                <div class="label">📱 Teléfono:</div>
                <div class="value">${phone}</div>
              </div>
            ` : ''}
            
            <div class="field">
              <div class="label">📋 Tipo de Consulta:</div>
              <div class="value">${inquiryTypes[inquiry] || inquiry}</div>
            </div>
            
            <div class="field">
              <div class="label">💬 Mensaje:</div>
              <div class="value">${message.replace(/\n/g, '<br>')}</div>
            </div>
            
            <div class="footer">
              Mensaje recibido el ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Enviar email al equipo
    await transporter.sendMail({
      from: `"SMDM Landing Page" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_EMAIL || 'contacto@solvenca.lat', // Email donde recibirás los mensajes
      subject: `🔔 Nuevo contacto: ${inquiryTypes[inquiry]} - ${company}`,
      html: emailHTML
    });

    // Email de confirmación al cliente (opcional)
    await transporter.sendMail({
      from: `"SMART Soluciones" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Gracias por contactarnos - SMART Soluciones',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>¡Gracias por contactarnos!</h1>
            </div>
            <div class="content">
              <p>Hola <strong>${name}</strong>,</p>
              
              <p>Hemos recibido tu mensaje sobre: <strong>${inquiryTypes[inquiry]}</strong></p>
              
              <p>Nuestro equipo revisará tu consulta y te responderemos lo antes posible a <strong>${email}</strong>.</p>
              
              <p>Si tienes alguna pregunta urgente, no dudes en contactarnos directamente.</p>
              
              <p>Saludos cordiales,<br>
              <strong>Equipo de SMART Soluciones Tecnológicas</strong></p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;">
                SMART SOLUCIONES TECNOLÓGICAS C.A. | Venezuela<br>
                Enterprise Mobile Device Management Solutions
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    });

    // Log para debugging
    console.log('✅ Mensaje de contacto recibido:', {
      name,
      email,
      company,
      inquiry,
      timestamp: new Date().toISOString()
    });

    res.json({ 
      success: true,
      message: 'Mensaje enviado exitosamente. Te contactaremos pronto.' 
    });

  } catch (error) {
    console.error('❌ Error en endpoint de contacto:', error);
    res.status(500).json({ 
      error: 'Error al enviar el mensaje. Por favor intenta nuevamente.' 
    });
  }
});

module.exports = router;