// ===================================================
// ENDPOINT DE CONTACTO CON RESEND
// Solución alternativa a SMTP que evita problemas de firewall
// Archivo: routes/contact-resend.js
// ===================================================

const express = require('express');
const router = express.Router();
const { Resend } = require('resend');

// Inicializar Resend con tu API key
const resend = new Resend(process.env.RESEND_API_KEY);

console.log('✅ Router de contacto (Resend) cargado');

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

    // Sanitizar datos
    const sanitize = (str) => str.replace(/[<>]/g, '');
    const sanitizedData = {
      name: sanitize(name),
      email: sanitize(email),
      company: sanitize(company),
      phone: phone ? sanitize(phone) : '',
      inquiry: sanitize(inquiry),
      message: sanitize(message)
    };

    const inquiryTypes = {
      pilot: 'Pilot Program',
      demo: 'Request Demo',
      partnership: 'Partnership Opportunity',
      general: 'General Inquiry'
    };

    // Email HTML para el equipo
    const teamEmailHTML = `
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

    // Enviar email al equipo
    const { data: teamEmail, error: teamError } = await resend.emails.send({
      from: 'SMDM Landing Page <noreply@solvenca.lat>', // Debe ser tu dominio verificado
      to: [process.env.CONTACT_EMAIL || 'admin@solvenca.lat'],
      replyTo: sanitizedData.email,
      subject: `🔔 Nuevo contacto: ${inquiryTypes[sanitizedData.inquiry]} - ${sanitizedData.company}`,
      html: teamEmailHTML
    });

    if (teamError) {
      console.error('❌ Error enviando email al equipo:', teamError);
      throw teamError;
    }

    console.log('✅ Email enviado al equipo. ID:', teamEmail.id);

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
            <div style="margin-top: 15px;">
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

    const { data: clientEmail, error: clientError } = await resend.emails.send({
      from: 'SMART Soluciones Tecnológicas <noreply@solvenca.lat>',
      to: [sanitizedData.email],
      subject: 'Gracias por contactarnos - SMART Soluciones',
      html: confirmationHTML
    });

    if (clientError) {
      console.error('⚠️ Error enviando confirmación al cliente:', clientError);
      // No fallar si el email de confirmación falla
    } else {
      console.log('✅ Email de confirmación enviado al cliente. ID:', clientEmail.id);
    }

    // Log del contacto
    console.log('📧 Contacto procesado:', {
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
    
    res.status(500).json({ 
      error: 'Error al enviar el mensaje. Por favor intenta nuevamente o contáctanos directamente a admin@solvenca.lat' 
    });
  }
});

module.exports = router;