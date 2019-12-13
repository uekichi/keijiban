'use strict';
const crypto = require('crypto');
const pug = require('pug');
const Cookies = require('cookies');
const util = require('./handler-util');
const Post = require('./post');
const moment = require('moment-timezone');

const trackingIdKey = 'tracking_id';

const oneTimeTokenMap = new Map();

function handle(req, res) {
  const cookies = new Cookies(req, res);
  const trackingId = addTrackingCookie(cookies, req.user);

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      //console.log(typeof cookies.get(trackingIdKey));     typeof で型を調べられる
      //res.end(pug.renderFile('./views/posts.pug', {contents: contents}));
      Post.findAll({order:[['id', 'DESC']]}).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\+/g, ' ');
          post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
        });
        const oneTimeToken = crypto.randomBytes(8).toString('hex');
        oneTimeTokenMap.set(req.user, oneTimeToken);
        res.end(pug.renderFile('./views/posts.pug', {
          posts: posts,
          user: req.user,
          oneTimeToken: oneTimeToken
        }));
        console.info(`閲覧されました: user: ${req.user}, trackingId: ${trackingId}, IPアドレス: ${req.connection.remoteAddress}, user-agent:${req.headers['user-agent']}`);
      });
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', () => {
        const decoded = decodeURIComponent(body);
        // const content = decoded.split('content=')[1];
        // console.info(`「${content}」が投稿されました`);
        
        // Post.create({
        //   content: content,
        //   trackingCookie: trackingId,
        //   postedBy: req.user
        // }).then(() => {
        //   handleRedirectPosts(req, res);
        // });
        const dataArray = decoded.split('&');
        const content = dataArray[0] ? dataArray[0].split('content=')[1] : '';
        const requestedOneTimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
        if (oneTimeTokenMap.get(req.user) === requestedOneTimeToken) {
          console.info(`投稿されました: ${content}`);
          Post.create({
            content: content,
            trackingCookie: trackingId,
            postedBy: req.user
          }).then(() => {
            oneTimeTokenMap.delete(req.user);
            handleRedirectPosts(req, res);
          });
        } else {
          util.handleBadRequest(req, res);
        }
      });
      break;
    default:
        util.handleBadRequest(req, res);
      break;
  }
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', () => {
        const decoded = decodeURIComponent(body);
        const dataArray = decoded.split('&');
        const id = dataArray[0] ? dataArray[0].split('id=')[1] : '';
        const requestedOneTimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
        if (oneTimeTokenMap.get(req.user) === requestedOneTimeToken) {
          Post.findByPk(id).then((post) => {
            if (req.user === post.postedBy || req.user === 'admin') {
              post.destroy().then(() => {
                console.info(
                  `削除されました: user: ${req.user}, ` +
                  `remoteAddress: ${req.connection.remoteAddress}, ` +
                  `userAgent: ${req.headers['user-agent']} `
                );
                oneTimeTokenMap.delete(req.user);
                handleRedirectPosts(req, res);
              });
            } 
          });
        } else {
          util.handleBadRequest(req, res);
        }
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}


/**
 * 
 * @param {Cookies} cookies 
 * @param {String} userName 
 * @return {String} トラッキングID
 */
function addTrackingCookie(cookies, userName) {
  const requestedTrackingId = cookies.get(trackingIdKey);
  if (isValidTrackingId(requestedTrackingId, userName)) {
    return requestedTrackingId;
  } else {
    const originalId = parseInt(crypto.randomBytes(8).toString('hex'), 16);
    const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
    const trackingId = originalId + '_' + createValidHash(originalId, userName);
    cookies.set(trackingIdKey, trackingId, { expires: tomorrow});
    return trackingId;
  }
}

function isValidTrackingId(trackingId, userName) {
  if (!trackingId) {
    return false;
  }
  const splitted = trackingId.split('_');
  const originalId = splitted[0];
  const requestedHash = splitted[1];
  return createValidHash(originalId, userName) === requestedHash;
}

const secretKey = '63dc7e39e82836ad4179a3e9525419edbfea8d'+
                  '344e1ae7da887930f7c0d630dad66a7c4a0eb9'+
                  'f521399fb8032a058be3136cf7978fd55d2e6c'+
                  '81e679abcfeff2ac365225a84850c19c6f142a'+
                  'a4659f0d885dedc3d50d33abc237c9337c33a2'+
                  'f618511687fb6181b5d7a861ca79867c42eb56'+
                  '12da1b16bcb6ecaa0182c2f46ee3b5bd305bf9'+
                  'b4c61cd77a13329bfbf7d2d1111cf7659bbf85'+
                  '441879447a0a18828ab91c5b434be4acc5bb8e'+
                  '464965cde2afedfade06f4fa454e8de92beacf'+
                  '053ae82974b5af47ebc0f3ad1c4a6172048582'+
                  'a95fd37c08db25fba0591feee3f58310b786b7'+
                  'b9412d117cff0bd0a848af64e7a6a7d9faddaf';

function createValidHash(originalId, userName) {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(originalId + userName + secretKey);
  return sha1sum.digest('hex');
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

module.exports = {
  handle,
  handleDelete
};