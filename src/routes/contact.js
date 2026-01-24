// ===================================================
// ENDPOINT DE CONTACTO PARA EL LANDING PAGE
// Optimizado para Google Workspace (admin@solvenca.lat)
// Archivo: routes/contact.js (o el nombre que uses)
// ===================================================

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer'); // Para enviar emails

// Configuración del transportador de email para Google Workspace
// IMPORTANTE: Configura estas variables de entorno en tu .env
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: false, // true para puerto 465, false para otros puertos
  auth: {
    user: process.env.SMTP_USER, // admin@solvenca.lat
    pass: process.env.SMTP_PASS  // Contraseña de aplicación de Google Workspace
  },
  // Opciones adicionales para mejor compatibilidad con Google Workspace
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }
});

// Verificar conexión SMTP al iniciar (opcional pero recomendado)
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Error de conexión SMTP:', error);
  } else {
    console.log('✅ Servidor SMTP listo para enviar emails desde', process.env.SMTP_USER);
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

    // Prevenir inyección de scripts básica
    const sanitize = (str) => str.replace(/[<>]/g, '');
    const sanitizedData = {
      name: sanitize(name),
      email: sanitize(email),
      company: sanitize(company),
      phone: phone ? sanitize(phone) : '',
      inquiry: sanitize(inquiry),
      message: sanitize(message)
    };

    // Guardar en base de datos (opcional)
    // const contact = await Contact.create({
    //   ...sanitizedData,
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
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
            line-height: 1.6; 
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px 20px;
            text-align: center;
          }
          .header h2 {
            margin: 0;
            font-size: 24px;
          }
          .content { 
            padding: 30px 20px;
          }
          .field { 
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e9ecef;
          }
          .field:last-child {
            border-bottom: none;
          }
          .label { 
            font-weight: 600; 
            color: #667eea;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .value { 
            margin-top: 8px;
            font-size: 16px;
            color: #2c3e50;
          }
          .value a {
            color: #667eea;
            text-decoration: none;
          }
          .footer { 
            margin-top: 20px; 
            padding: 20px;
            background-color: #f8f9fa;
            font-size: 13px; 
            color: #6c757d; 
            text-align: center;
            border-top: 1px solid #e9ecef;
          }
          .badge {
            display: inline-block;
            padding: 6px 12px;
            background: #667eea;
            color: white;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>📧 Nuevo Mensaje de Contacto</h2>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">www.solvenca.lat</p>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">👤 Nombre Completo</div>
              <div class="value">${sanitizedData.name}</div>
            </div>
            
            <div class="field">
              <div class="label">📧 Email de Contacto</div>
              <div class="value">
                <a href="mailto:${sanitizedData.email}">${sanitizedData.email}</a>
              </div>
            </div>
            
            <div class="field">
              <div class="label">🏢 Empresa</div>
              <div class="value">${sanitizedData.company}</div>
            </div>
            
            ${sanitizedData.phone ? `
              <div class="field">
                <div class="label">📱 Teléfono</div>
                <div class="value">
                  <a href="tel:${sanitizedData.phone}">${sanitizedData.phone}</a>
                </div>
              </div>
            ` : ''}
            
            <div class="field">
              <div class="label">📋 Tipo de Consulta</div>
              <div class="value">
                <span class="badge">${inquiryTypes[sanitizedData.inquiry] || sanitizedData.inquiry}</span>
              </div>
            </div>
            
            <div class="field">
              <div class="label">💬 Mensaje</div>
              <div class="value">${sanitizedData.message.replace(/\n/g, '<br>')}</div>
            </div>
          </div>
          <div class="footer">
            <strong>Mensaje recibido:</strong> ${new Date().toLocaleString('es-VE', { 
              timeZone: 'America/Caracas',
              dateStyle: 'full',
              timeStyle: 'long'
            })}<br>
            <small>Sistema SMDM - SMART Soluciones Tecnológicas C.A.</small>
          </div>
        </div>
      </body>
      </html>
    `;

    // Email al equipo (tu correo admin@solvenca.lat)
    const mailToTeam = await transporter.sendMail({
      from: `"SMDM Landing Page" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_EMAIL || process.env.SMTP_USER,
      replyTo: sanitizedData.email, // Permite responder directamente al cliente
      subject: `🔔 Nuevo contacto: ${inquiryTypes[sanitizedData.inquiry]} - ${sanitizedData.company}`,
      html: emailHTML,
      // Agregar texto plano como fallback
      text: `
Nuevo mensaje de contacto - SMDM

Nombre: ${sanitizedData.name}
Email: ${sanitizedData.email}
Empresa: ${sanitizedData.company}
${sanitizedData.phone ? `Teléfono: ${sanitizedData.phone}\n` : ''}
Tipo de Consulta: ${inquiryTypes[sanitizedData.inquiry]}

Mensaje:
${sanitizedData.message}

---
Recibido: ${new Date().toLocaleString('es-VE')}
      `.trim()
    });

    console.log('✅ Email enviado al equipo. Message ID:', mailToTeam.messageId);

    // Email de confirmación al cliente
    const confirmationHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
            line-height: 1.6; 
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content { 
            padding: 40px 30px;
          }
          .content p {
            margin: 15px 0;
            font-size: 16px;
            line-height: 1.8;
          }
          .highlight {
            background: #f8f9fa;
            padding: 20px;
            border-left: 4px solid #667eea;
            border-radius: 4px;
            margin: 25px 0;
          }
          .footer {
            padding: 30px 20px;
            background-color: #2c3e50;
            color: #ecf0f1;
            text-align: center;
            font-size: 14px;
          }
          .footer a {
            color: #667eea;
            text-decoration: none;
          }
          .contact-info {
            margin-top: 15px;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ ¡Gracias por contactarnos!</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${sanitizedData.name}</strong>,</p>
            
            <p>Hemos recibido tu mensaje sobre <strong>${inquiryTypes[sanitizedData.inquiry]}</strong> y queremos agradecerte por tu interés en nuestras soluciones de Mobile Device Management.</p>
            
            <div class="highlight">
              <p style="margin: 0;"><strong>📋 Resumen de tu consulta:</strong></p>
              <p style="margin: 10px 0 0 0;">
                <strong>Empresa:</strong> ${sanitizedData.company}<br>
                <strong>Tipo:</strong> ${inquiryTypes[sanitizedData.inquiry]}<br>
                <strong>Email de contacto:</strong> ${sanitizedData.email}
              </p>
            </div>
            
            <p>Nuestro equipo revisará tu consulta y te responderemos lo antes posible. Normalmente respondemos en un plazo de 24-48 horas hábiles.</p>
            
            <p>Si tu consulta es urgente o necesitas información adicional, no dudes en escribirnos directamente a <a href="mailto:admin@solvenca.lat">admin@solvenca.lat</a>.</p>
            
            <p>Saludos cordiales,<br>
            <strong>Equipo de SMART Soluciones Tecnológicas</strong></p>
          </div>
          <div class="footer">
            <p style="margin: 0 0 15px 0;"><strong>SMART SOLUCIONES TECNOLÓGICAS C.A.</strong></p>
            <p style="margin: 0;">Enterprise Mobile Device Management Solutions</p>
            <div class="contact-info">
              <p style="margin: 15px 0 5px 0;">
                🌐 <a href="https://www.solvenca.lat">www.solvenca.lat</a><br>
                📧 <a href="mailto:admin@solvenca.lat">admin@solvenca.lat</a><br>
                📍 Venezuela
              </p>
              <p style="margin: 15px 0 0 0; font-size: 12px; opacity: 0.8;">
                Built on Android Enterprise Technology
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailToClient = await transporter.sendMail({
      from: `"SMART Soluciones Tecnológicas" <${process.env.SMTP_USER}>`,
      to: sanitizedData.email,
      subject: 'Gracias por contactarnos - SMART Soluciones',
      html: confirmationHTML,
      text: `
Hola ${sanitizedData.name},

Hemos recibido tu mensaje sobre ${inquiryTypes[sanitizedData.inquiry]} y queremos agradecerte por tu interés en nuestras soluciones de Mobile Device Management.

Nuestro equipo revisará tu consulta y te responderemos lo antes posible.

Saludos cordiales,
Equipo de SMART Soluciones Tecnológicas

---
SMART SOLUCIONES TECNOLÓGICAS C.A.
www.solvenca.lat
admin@solvenca.lat
Venezuela
      `.trim()
    });

    console.log('✅ Email de confirmación enviado al cliente. Message ID:', mailToClient.messageId);

    // Log para debugging
    console.log('📧 Contacto procesado exitosamente:', {
      name: sanitizedData.name,
      email: sanitizedData.email,
      company: sanitizedData.company,
      inquiry: sanitizedData.inquiry,
      timestamp: new Date().toISOString()
    });

    res.json({ 
      success: true,
      message: 'Mensaje enviado exitosamente. Recibirás una confirmación en tu correo.' 
    });

  } catch (error) {
    console.error('❌ Error en endpoint de contacto:', error);
    
    // Logging más detallado para debugging
    if (error.code === 'EAUTH') {
      console.error('Error de autenticación SMTP. Verifica SMTP_USER y SMTP_PASS');
    } else if (error.code === 'ECONNECTION') {
      console.error('Error de conexión SMTP. Verifica SMTP_HOST y SMTP_PORT');
    }
    
    res.status(500).json({ 
      error: 'Error al enviar el mensaje. Por favor intenta nuevamente o contáctanos directamente a admin@solvenca.lat' 
    });
  }
});

module.exports = router;
