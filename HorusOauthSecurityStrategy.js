const HorusRestClient = require('./client/HorusRestClient.js');
const uuid = require('uuid');

function HorusOauthSecurityStrategy(expressServer, options) {
  logger.debug(options);

  var _this = this;
  var horusRestClient = new HorusRestClient(options.horusBaseUrl);

  expressServer.get(options.express.callbackRoute, function (req, res) {

    var authorizationCode = req.query.code;

    if (!authorizationCode || (typeof authorizationCode === 'undefined')) {
      logger.error("oauth authorization code is undefined. This is very rare. Is the earth planet alive?");
      res.redirect(options.express.failureRedirectRoute);
      return;
    }

    logger.info("Authorizing new user with google oauth code: " + authorizationCode);
    options.horusOptions.authenticate.authorizationCode = authorizationCode;

    var requestId = getRequestId(req);

    var params = {
      "grantType": options.horusOptions.authenticate.grantType,
      "clientId": options.horusOptions.authenticate.clientId,
      "authorizationCode": authorizationCode,
      "applicationId": options.horusOptions.authenticate.applicationId
    }

    horusRestClient.authenticate(params, requestId, function (horusAuthError, horusAuthResponse) {
      if (horusAuthError) {
        logger.error("Error in auth transaction: " + horusAuthError);
        res.redirect(options.express.failureRedirectRoute);
        return;
      }
      if (options.overrideResponse === true && options.defaultBussinessUnit) {
        logger.info("Modifying default response");
        var businessUnit = horusAuthResponse.businessUnits.find(bu => bu.identifier === options.defaultBussinessUnit);

        businessUnit.profiles.forEach(profile => {
          profile.options = mapMenuReferences(profile.options, options)
        })
      } else {
        logger.info("default response will be returned");
      }

      req.session.tokenInformation = {};

      req.session.tokenInformation.acquisitionTime = new Date().getTime();
      req.session.tokenInformation.refreshTokenV1 = horusAuthResponse.refreshTokenV1;
      req.session.tokenInformation.refreshTokenV2 = horusAuthResponse.refreshTokenV2;

      //delete unnecesary values
      delete horusAuthResponse.refreshTokenV1;
      delete horusAuthResponse.refreshTokenV2;

      req.session.connectedUserInformation = horusAuthResponse;
      req.session.save();

      if (req.session.originalUrl) {
        res.redirect(req.session.originalUrl);
      } else {
        res.redirect(options.express.defaultSuccessLoginRoute);
      }

      return;
    });

  });

  expressServer.get('/horus/public/login', function (req, res) {
    if(options.enablePublicLogin === true){
      logger.info("HorusOauthSecurity public login enabled")
      var requestId = getRequestId(req);

      var params = {
        "grantType": options.publicLoginGrantType,
        "clientId": "",
        "authorizationCode": "",
        "genericKey": options.publicLoginGenericKey,
        "subject": options.publicLoginGenericSubject,
        "applicationId": options.horusOptions.authenticate.applicationId
      }

      horusRestClient.authenticate(params, requestId, function (horusAuthError, horusAuthResponse) {
        if (horusAuthError) {
          logger.error("Error in auth transaction: " + horusAuthError);
          res.redirect(options.express.failureRedirectRoute);
          return;
        }
        if (options.overrideResponse === true && options.defaultBussinessUnit) {
          logger.info("Modifying default response");
          var businessUnit = horusAuthResponse.businessUnits.find(bu => bu.identifier === options.defaultBussinessUnit);
  
          businessUnit.profiles.forEach(profile => {
            profile.options = mapMenuReferences(profile.options, options)
          })
        } else {
          logger.info("public login default response will be returned");
        }

        req.session.tokenInformation = {};
  
        req.session.tokenInformation.acquisitionTime = new Date().getTime();
        req.session.tokenInformation.refreshTokenV1 = horusAuthResponse.refreshTokenV1;
        req.session.tokenInformation.refreshTokenV2 = horusAuthResponse.refreshTokenV2;
  
        //delete unnecesary values
        delete horusAuthResponse.refreshTokenV1;
        delete horusAuthResponse.refreshTokenV2;
  
        req.session.connectedUserInformation = horusAuthResponse;
        
        // injectando valores del public login (tokenV1 y datos básicos)
        req.session.connectedUserInformation.tokenV1 = req.session.publicUserInformation.tokenV1;
        req.session.connectedUserInformation.email = req.session.publicUserInformation.email;
        req.session.connectedUserInformation.firstName = req.session.publicUserInformation.name;
        req.session.connectedUserInformation.publicLoginId = req.session.publicUserInformation.id;
        req.session.connectedUserInformation.lastName = req.session.publicUserInformation.lastname;
        req.session.connectedUserInformation.prueba = "prueba"

        req.session.signinStarted = true;
        req.session.save();

        logger.info("session =====>")
        logger.info(req.session)
  
        if (req.session.originalUrl) {
          res.redirect(req.session.originalUrl);
        } else {
          res.redirect(options.express.defaultSuccessLoginRoute);
        }
  
        return;
      });


    } else {
      logger.error("HorusOauthSecurity Public login is disabled")
      res.redirect("/");
    }
  })

  this.ensureAuthenticated = function (req, res, next) {

    logger.debug("ensure if user is authenticated:" + req.path);
    logger.info("entro=====================")

    if (!req.session || (typeof req.session === 'undefined')) {
      throw new Error("Session is not properly configured");
    }

    if (req.session.connectedUserInformation) {
      //User is already logged in
      if (isHorusTokenExpired(req)) {
        //refresh tokens
        logger.debug("Horus token is expired");

        var params = {
          "grantType": "refresh_token",
          "refreshTokenV1": req.session.tokenInformation.refreshTokenV1,
          "refreshTokenV2": req.session.tokenInformation.refreshTokenV2
        }

        var requestId = getRequestId(req);

        horusRestClient.refreshTokens(params, requestId, function (refreshTokensError, refreshTokensResponse) {
          if (refreshTokensError) {
            logger.debug("token renewal failure:" + refreshTokensError);
            if (req.path.endsWith("/settings.json")) {
              var settings = {};
              settings.session = {};
              settings.session.expiredSession = true;
              responseUtil.createJsonResponse(settings, req, res);
              return;
            } else {
              res.redirect(options.express.failureRedirectRoute);
              return;
            }
          }

          //no errors, update tokens
          req.session.connectedUserInformation.tokenV1 = refreshTokensResponse.tokenV1;
          req.session.connectedUserInformation.tokenV2 = refreshTokensResponse.tokenV2;

          //upate refresh tokens
          req.session.tokenInformation.refreshTokenV1 = refreshTokensResponse.refreshTokenV1;
          req.session.tokenInformation.refreshTokenV2 = refreshTokensResponse.refreshTokenV2;
          req.session.tokenInformation.acquisitionTime = new Date().getTime();

          req.session.connectedUserInformation.renewedTokens = true;

          return next();
        });
      } else {
        req.session.connectedUserInformation.renewedTokens = false;
        return next();
      }
    } else {
      logger.info("User not logged in");

      var params = {
        "clientId": options.horusOptions.authenticate.clientId,
        "clientType": options.horusOptions.authenticate.clientType,
        "applicationId": options.horusOptions.authenticate.applicationId
      }

      var requestId = getRequestId(req);

      horusRestClient.getAuthorizeUrl(params, requestId, function (getAuthorizeUrlErr, authorizeUrl) {
        if (getAuthorizeUrlErr) {
          logger.error(getAuthorizeUrlErr);
          res.redirect(options.express.failureRedirectRoute);
          return;
        }

        logger.info("Redirect url: " + authorizeUrl);
        res.redirect(authorizeUrl);
        return;
      });
    }
  }


  function isHorusTokenExpired(req) {
    var acquisitionTime = req.session.tokenInformation.acquisitionTime;
    var now = new Date().getTime();
    var tokenExpirationTime = options.horusOptions.tokenExpirationTime;
    logger.debug("now:" + now + " acquisitionTime:" + acquisitionTime + " tokenExpirationTime:" + tokenExpirationTime * 1000)
    return now > (acquisitionTime + tokenExpirationTime * 1000);
  }

  function getRequestId(req) {
    if (sessions && req.sessionID && typeof sessions[req.sessionID] !== 'undefined') {
      return sessions[req.sessionID];
    } else {
      return uuid.v4();
    }

    var acquisitionTime = req.session.tokenInformation.acquisitionTime;
    var now = new Date().getTime();
    var tokenExpirationTime = options.horusOptions.tokenExpirationTime;
    logger.debug("now:" + now + " acquisitionTime:" + acquisitionTime + " tokenExpirationTime:" + tokenExpirationTime * 1000 +
      " expired:" + (now > (acquisitionTime + tokenExpirationTime * 1000)))
    return now > (acquisitionTime + tokenExpirationTime * 1000);
  }

}

function mapMenuReferences(menuOptions, appOptions) {
  var menus = [];
  menuOptions.forEach(opt => {
    var matched = opt.value.match(appOptions.regexPattern);
    if (matched) {
      var baseUrl = appOptions.dependencies[matched[1]];
      if (baseUrl) {
        opt.value = opt.value.replace(matched[0], baseUrl);
      }
    }
    addIcon(opt, appOptions);

    childrens = embeddedMenu(menuOptions, opt.id);

    if (childrens.length) { opt.childs = childrens }

    if (opt.parentId === undefined) {
      menus.push(opt);
    }
  });
  return menus;
}

function embeddedMenu(menuOptions, parentId) {
  return menuOptions.filter(menu => menu.parentId === parentId);
}

function addIcon(menu, options) {
  if (options.menuIcons && options.menuIcons[menu.identifier]) {
    menu.icon = options.menuIcons[menu.identifier];
  }
}


module.exports = HorusOauthSecurityStrategy;
