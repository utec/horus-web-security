const HorusRestClient = require('./client/HorusRestClient.js');

function HorusOauthSecurityStrategy(expressServer, options) {
  logger.info(options);

  var _this = this;
  var horusRestClient = new HorusRestClient(options.horusBaseUrl);

  expressServer.get(options.express.callbackRoute, function(req, res) {

    var authorizationCode = req.query.code;

    if (!authorizationCode || (typeof authorizationCode === 'undefined')) {
      logger.error("oauth authorization code is undefined. This is very rare. Is the earth planet alive?");
      res.redirect(options.express.failureRedirectRoute);
      return;
    }

    logger.info("Authorization new user with code: "+authorizationCode);
    options.horusOptions.authenticate.authorizationCode = authorizationCode;

    horusRestClient.authenticate(options.horusOptions.authenticate, function(getAuthorizeUrlErr, userConfig) {
      if (getAuthorizeUrlErr) {
        logger.error("Error in auth transaction: "+getAuthorizeUrlErr);
        res.redirect(options.express.failureRedirectRoute);
        return;
      }
      logger.info("Mapping menu from response");
      userConfig.options = mapMenuReferences(userConfig.options, options);

      req.session.connectedUserInformation = userConfig;
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
      return next();
    } else {
      logger.info("User not logged in");

      logger.info(options.horusOptions.authorizeUrl);
      horusRestClient.getAuthorizeUrl(options.horusOptions.authorizeUrl, function(getAuthorizeUrlErr, authorizeUrl) {
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
  if(options.menuIcons && options.menuIcons[menu.identifier]) {
    menu.icon = options.menuIcons[menu.identifier];
  }
}


module.exports = HorusOauthSecurityStrategy;
