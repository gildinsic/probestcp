#!/home/monitor/.nvm/versions/node/v10.7.0/bin/node

const fs = require('fs')
fs.writeFileSync('/run/monitor/monitor.probe.tcp.pid',process.pid)

const common = require('../common/lib.js')

const net = require('net')

var redis = require("redis")
var db = redis.createClient()


var events = require('events');
var watcher = new events.EventEmitter();


watcher.on('connect',function(probe) {
  console.log('probe.tcp connect')
  const xx = JSON.stringify(probe)
  db.publish('tcp2',xx)
  delete probe
})
watcher.on('timeout',function(probe) {
  console.log('probe.tcp timeout')
//  const xx = JSON.stringify(probe)
//  db.publish('tcp2',xx)
//  delete probe
})
watcher.on('error',function(probe) {
  console.log('probe.tcp error',probe.error)
  const xx = JSON.stringify(probe)
  db.publish('tcp2',xx)
  //delete probe
})
watcher.on('close',function(probe) {
  console.log('probe.tcp close',probe.error)
  //const xx = JSON.stringify(probe)
  //db.publish('tcp2',xx)
  //delete probe
})



const wait = 5*60*1000

function dotcpprobe(probe) {
  return function() {
    var client = new net.Socket()
    client.setTimeout(4000);
    client.probe = probe
    client.probe.sent  = Date.now()
    client.probe.error = null
    client.connect(probe.port,probe.ip,function() {
      this.end()
      this.probe.rtt = Date.now()-this.probe.sent
      this.probe.cnt.connect++
      watcher.emit('connect',this.probe)
    })
    client.on('timeout',function() {
      this.end()
      this.probe.rtt = Date.now()-this.probe.sent
      watcher.emit('timeout',this.probe)
    })
    client.on('error',function(error) {
      this.destroy()
      this.probe.rtt = Date.now()-this.probe.sent
      this.probe.error = error.code
      var cnt = this.probe.cnt
      switch(error.code) {
        case 'EMFILE':       cnt.emfile++; break;
        case 'ETIMEDOUT':    cnt.etimedout++; break;
        case 'ENETUNREACH':  cnt.enetunreach++; break;
        case 'EHOSTUNREACH': cnt.ehostunreach++; break;
        case 'ECONNRESET':   cnt.econnreset++; break;
        case 'ECONNREFUSED': cnt.econnrefused++; break;
        default: return;
      }
      cnt.errors++
      watcher.emit('error',this.probe)
    })
    client.on('close',function(error) {
      watcher.emit('close',this.probe)
    })
  }
}
function dotcp(probe) {
   probe.cnt = {
     connect:0,
     errors:0,
     emfile:0,
     etimedout:0,
     enetunreach:0,
     ehostunreach:0,
     econnreset:0,
     econnrefused:0,
   }
   return function() {
     setInterval(dotcpprobe(probe),wait)
   }
}


var nets32 = []

const sub = redis.createClient()
sub.on("message", function (channel, message) {
  switch(channel) {
    case "monitor":
      return
    case "network32":
      const ip = message
      if(!common.ip32.test(ip)) { return; }
      if(nets32[ip]) { return; }
      var tcp80  = { p:'tcp', ip:ip, port: 80, proto:'http', }
      var tcp443 = { p:'tcp', ip:ip, port:443, proto:'https' }
      nets32[ip] = [ tcp80, tcp443 ]
      setTimeout(dotcp(tcp80 ),wait*Math.random())
      setTimeout(dotcp(tcp443),wait*Math.random())
      return
    default:
      return
  }
})
sub.subscribe('monitor')
sub.subscribe('network32')

db.publish('monitor','networks')
