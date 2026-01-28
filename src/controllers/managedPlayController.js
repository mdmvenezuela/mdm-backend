const { getAndroidManagementClient } = require('../services/androidManagement');

exports.getManagedPlayIframe = async (req, res) => {
  try {
    // 🔐 Seguridad: solo super_admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const androidManagement = await getAndroidManagementClient();

    // ⚠️ USÁ tu enterpriseName REAL guardado en DB o env
    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;
    // ejemplo: enterprises/LC02abcxyz

    const response = await androidManagement.enterprises.webTokens.create({
      parent: enterpriseName,
      requestBody: {
        parentFrameUrl: 'https://solvenca.lat',
        enabledFeatures: [
          'MANAGED_GOOGLE_PLAY'
        ]
      }
    });

    res.json({
      iframeUrl: response.data.value
    });

  } catch (error) {
    console.error('Error creando Managed Play iframe:', error);
    res.status(500).json({
      error: 'Error creando iframe de Managed Google Play',
      details: error.message
    });
  }
};
