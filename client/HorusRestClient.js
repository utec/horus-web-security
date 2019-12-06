const axios = require('axios');
var jp = require('jsonpath');

function HorusRestClient(horusBaseUrl) {

  var horusAuthenticateEndpoint = horusBaseUrl + '/v1/nonspec/oauth2/auth';
  var horusGetAuthorizeUrlEndpoint = horusBaseUrl + '/v1/nonspec/oauth2/auth/url';

  this.authenticate = function(params, callback) {
    try {
      axios({
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          url: horusAuthenticateEndpoint,
          data: params,
        })
        .then(function(horusResponse) {

          if (!horusResponse || (typeof horusResponse === 'undefined')) {
            return callback("Horus " + horusGetOptionsEndpoint + " http response is wrong.", null);
          }

          if (!horusResponse.data || (typeof horusResponse.data === 'undefined')) {
            return callback("Horus " + horusGetOptionsEndpoint + " http response body is null, empty or wrong.", null);
          }

          var status = jp.query(horusResponse.data, '$.status');

          if (status != "200") {
            return callback("Horus " + horusGetOptionsEndpoint + " json response contains [status] different to 200:" + JSON.stringify(horusResponse.data), null);
          }

          return callback(null, horusResponse.data.content);

        })
        .catch(function(err) {
          logger.error(err.response);
          return callback("Horus is down or " + horusGetOptionsEndpoint + " does not respond: " + err.message, null);
        });
    } catch (globalErr) {
      logger.error(globalErr.stack);
      return callback("Error when consuming Horus service " + horusGetOptionsEndpoint + ":" + globalErr.message, null);
    }

  }

  this.getAuthorizeUrl = function(params, callback) {

    try {
      axios({
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          url: horusGetAuthorizeUrlEndpoint,
          data: params
        })
        .then(function(horusResponse) {
          if (!horusResponse || (typeof horusResponse === 'undefined')) {
            return callback("Horus " + horusGetAuthorizeUrlEndpoint + " http response is wrong.", null)
          }

          if (!horusResponse.data || (typeof horusResponse.data === 'undefined')) {
            return callback("Horus " + horusGetAuthorizeUrlEndpoint + " http response.data is wrong.", null);
          }

          if (!horusResponse.data.status || (typeof horusResponse.data.status === 'undefined')) {
            return callback("Horus " + horusGetAuthorizeUrlEndpoint + " http response status is undefined.", null);
          }

          if (horusResponse.data.status != "200") {
            return callback("Horus " + horusGetAuthorizeUrlEndpoint + " http response status " + horusResponse.data.status + " is different to 200:" + JSON.stringify(horusResponse.data), null);
          }

          if (!horusResponse.data.content || (typeof horusResponse.data.content === 'undefined')) {
            return callback("Horus " + horusGetAuthorizeUrlEndpoint + " http response content is undefined. Redirect url was expected :" + horusResponse.data.content, null);
          }
          return callback(null, horusResponse.data.content.url);

        })
        .catch(function(err) {
          logger.error(err.response);
          logger.error("Error: "+err.response.data.status+", message:"+err.response.data.message);
          return callback("Horus is down or " + horusGetAuthorizeUrlEndpoint + " does not respond: " + err.message, null);
        });
    } catch (globalErr) {
      logger.error(globalErr.stack);
      return callback("Error when consuming Horus service:" + globalErr.message, null);
    }

  }
}


module.exports = HorusRestClient
