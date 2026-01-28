const { initAndroidManagement } = require('../utils/androidManagement');

exports.getManagedPlayIframe = async (req, res) => {
  try {
    // Seguridad extra (aunque ya pasa por middleware)
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const androidManagement = await initAndroidManagement();

    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;
    const callbackUrl = 'https://solvenca.lat/admin/apps'; 
    // podés cambiar luego

    const response = await androidManagement.enterprises.webApps.generateManagedPlayStoreUrl({
      parent: enterpriseName,
      requestBody: {
        enabled: true,
        storeBuilderEnabled: true,
        iframe: {
          parentOrigin: 'https://solvenca.lat',
        },
        callbackUrl,
      },
    });

    res.json({
      iframeUrl: response.data.url,
    });

  } catch (error) {
    console.error('❌ Error generando iframe Managed Play:', error);
    res.status(500).json({
      error: 'Error generando iframe de Managed Google Play',
      details: error.message,
    });
  }
};
