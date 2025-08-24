const axios = require("axios")
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET
const BDD_SERVICE_URL = process.env.BDD_SERVICE_URL

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization && req.headers.authorization.split(" ")[1]

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token requis",
      })
    }

    // Vérifier le token JWT
    const decoded = jwt.verify(token, JWT_SECRET)

    // Récupérer l'utilisateur depuis la BDD
    const userResponse = await axios.get(`${BDD_SERVICE_URL}/api/user/${decoded.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      timeout: 10000,
      validateStatus: (status) => status >= 200 && status < 500,
    })

    if (userResponse.status !== 200 || !userResponse.data.success) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non trouvé",
      })
    }

    req.user = userResponse.data.data
    next()
  } catch (error) {
    console.error("Erreur authentification:", error)

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expiré",
      })
    }

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        success: false,
        message: "Service BDD indisponible",
      })
    }

    res.status(500).json({
      success: false,
      message: "Erreur d'authentification",
    })
  }
}

module.exports = authenticate
