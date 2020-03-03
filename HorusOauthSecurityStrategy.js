const HorusRestClient = require('./client/HorusRestClient.js');

function HorusOauthSecurityStrategy(expressServer, options) {
  logger.debug(options);

  var _this = this;
  var horusRestClient = new HorusRestClient(options.horusBaseUrl);

  expressServer.get(options.express.callbackRoute, function(req, res) {

    var authorizationCode = req.query.code;

    if (!authorizationCode || (typeof authorizationCode === 'undefined')) {
      logger.error("oauth authorization code is undefined. This is very rare. Is the earth planet alive?");
      res.redirect(options.express.failureRedirectRoute);
      return;
    }

    logger.info("Authorizing new user with google oauth code: "+authorizationCode);
    options.horusOptions.authenticate.authorizationCode = authorizationCode;

    var params = {
      "grantType":options.horusOptions.authenticate.grantType,
      "clientId":options.horusOptions.authenticate.clientId,
      "authorizationCode":authorizationCode,
      "applicationId":options.horusOptions.authenticate.applicationId
    }

    horusRestClient.authenticate(params, function(horusAuthError, horusAuthResponse) {
      if (horusAuthError) {
        logger.error("Error in auth transaction: "+horusAuthError);
        res.redirect(options.express.failureRedirectRoute);
        return;
      }

      if(options.overrideResponse === true){
        logger.info("Modifying oauth default response");
        horusAuthResponse.options = mapMenuReferences(horusAuthResponse.options, options);
      }else{
        logger.info("default oauth response will be returned");
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

  this.ensureAuthenticated = function(req, res, next) {

    if (!req.session || (typeof req.session === 'undefined')) {
      throw new Error("Session is not properly configured");
    }

    if (req.session.connectedUserInformation) {
      //User is already logged in
      if(isHorusTokenExpired(req)){
        //refresh tokens
        logger.debug("Horus token is expired");

        var params = {
           "grantType":"refresh_token",
           "refreshTokenV1":req.session.tokenInformation.refreshTokenV1,
           "refreshTokenV2":req.session.tokenInformation.refreshTokenV2
        }

        horusRestClient.refreshTokens(params, function(refreshTokensError, refreshTokensResponse){
          if(refreshTokensError){
            logger.debug("token renewal failure:"+refreshTokensError);
            if(req.path.endsWith("/settings.json")){
              var settings = {};
              settings.session = {};
              settings.session.expiredSession = true;
              responseUtil.createJsonResponse(settings, req, res);
              return;
            }else{
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

          return next();
        });
      }else{
        return next();
      }
    } else {
      logger.info("User not logged in");

      var params = {
         "clientId":options.horusOptions.authenticate.clientId,
         "clientType":options.horusOptions.authenticate.clientType,
         "applicationId":options.horusOptions.authenticate.applicationId
      }

      horusRestClient.getAuthorizeUrl(params, function(getAuthorizeUrlErr, authorizeUrl) {
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


  function isHorusTokenExpired(req){
    var acquisitionTime = req.session.tokenInformation.acquisitionTime;
    var now = new Date().getTime();
    var expirationTime = options.horusOptions.expirationTime;
    return now > (acquisitionTime + expirationTime*1000);
  }

}

function mapMenuReferences(menuOptions, appOptions) {
  var menus = [];
  menuOptions.forEach(opt => {
    var matched = opt.value.match(appOptions.regexPattern);
    if(matched) {
      var baseUrl = appOptions.dependencies[matched[1]];
      if(baseUrl) {
        opt.value = opt.value.replace(matched[0], baseUrl);
      }
    }
    addIcon(opt, appOptions);

    childrens = embeddedMenu(menuOptions, opt.id);

    if (childrens.length) { opt.childs = childrens }

    if(opt.parentId === undefined) {
      menus.push(opt);
    }
  });
  return menus;
}

function embeddedMenu(menuOptions, parentId) {
  return menuOptions.filter(menu => menu.parentId === parentId);
}

function addIcon(menu, options) {
  if(options.menuIcons) {
    if(options.menuIcons[menu.identifier]) {
      menu.icon = options.menuIcons[menu.identifier];
    }
  }
}


module.exports = HorusOauthSecurityStrategy;
