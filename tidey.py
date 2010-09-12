#!/usr/bin/env python2.6
# -*- encoding: utf-8 -*-
import os,csv,re,urllib
from subprocess import Popen,PIPE
from datetime import date,datetime,timedelta
import tornado.httpclient
import tornado.httpserver
import tornado.ioloop
import tornado.web
from mx.DateTime.Parser import DateTimeFromString

os.environ['HFILE_PATH'] = '/home/brianglass/etc/xtide/harmonics-dwf-20081228-free.tcd'

class MainHandler(tornado.web.RequestHandler):
	def get(self):
		self.render('index.html')

# suck in station list at startup
stations = []
stationslugs = {}
station_re = re.compile(r'(?P<station>.*?)\s+(?P<type>sub|ref)\s*(?P<latitude>\d+\.\d+)°\s+(?P<ns>N|S),.*?(?P<longitude>\d+.\d+)°\s+(?P<ew>W|E)',re.I)
signs = {'N':'', 'S':'-', 'W':'-', 'E':''}
for line in Popen('tide -m l 2>/dev/null', shell=True, stdout=PIPE).stdout:
	m = station_re.match(line)
	if m:
		slug = re.sub( '\W+','-',m.group('station') )
		station = m.groupdict().copy()
		station['slug'] = slug

		stationslugs[slug] = station
		stations.append( station )

class StationList(tornado.web.RequestHandler):
	def get(self,type):
		xml = self.render_string('station_list.'+type,stations=stations)
		if type == 'js':
			self.set_header('Content-Type','text/javascript')
		elif type == 'kml':
			self.set_header('Content-Type','text/xml')

		self.finish(xml)

class Station(tornado.web.RequestHandler):
	@tornado.web.asynchronous
	def get(self,slug):
		self.station = station = stationslugs[slug]
		if 'max' in station and 'zipcode' in station:
			self.render('station.html',station=station)
		else:
			# get the zipcode
			http = tornado.httpclient.AsyncHTTPClient()
			http.fetch('http://maps.google.com/maps/geo?q=%s%s,%s%s&output=json&key=ABQIAAAAPyT2dy_300Hbp9DCrLLtnxSU2UmzemFlFFqfAmP3gSeY-Gd36BScdBJkvksi0nrPTIkX6S26fdhlkQ' % (signs[station['ns']],station['latitude'],signs[station['ew']],station['longitude']), callback=self.async_callback(self.zipcode_response))

			# get the station details
			self.pipe = p = Popen('tide -m s -l "%s" 2>/dev/null' % station['station'], shell=True, stdout=PIPE).stdout
			self.ioloop = tornado.ioloop.IOLoop.instance()
			self.ioloop.add_handler( p.fileno(), self.async_callback(self.on_response), self.ioloop.READ )

	def zipcode_response(self,response):
		if response.error: raise tornado.web.HTTPError(500)
		json = tornado.escape.json_decode(response.body)
		for p in json['Placemark']:
			try:
				self.station['zipcode'] = p['AddressDetails']['Country']['AdministrativeArea']['SubAdministrativeArea']['Locality']['PostalCode']['PostalCodeNumber']
				break
			except KeyError:
				self.station['zipcode'] = None

		if 'max' in self.station:
			self.render('station.html',station=self.station)

	def on_response(self,fd,events):
		self.ioloop.remove_handler(fd)

		stats = ''.join( self.pipe.readlines() )

		m = re.search('upper bound:\s+(-?[\d\.]+)',stats,re.I)
		if m:
			self.station['max'] = m.group(1)

		m = re.search('lower bound:\s+(-?[\d\.]+)',stats,re.I)
		if m:
			self.station['min'] = m.group(1)

		if 'zipcode' in self.station:
			self.render('station.html',station=self.station)

class TideHandler(tornado.web.RequestHandler):
	heightfields = ['location','date','height']
	eventfields = ['location','date','time','height','event']

	@tornado.web.asynchronous
	def get(self,slug,year,month,day):
		location = stationslugs[slug]
		self.tides = {'location':location}
		start = datetime( year=int(year), month=int(month), day=int(day) )
		end = start + timedelta(1,60)
		b = start.strftime('%Y-%m-%d %H:%M')
		e = end.strftime('%Y-%m-%d %H:%M')

		self.ph = ph = Popen('tide -f c -m r -s "00:30" -b "%s" -e "%s" -l "%s" 2>/dev/null' % (b,e,location['station']), shell=True, stdout=PIPE).stdout
		self.pe = pe = Popen('tide -tf "%%I:%%M %%p %%Z@%%s@%%z" -f c -b "%s" -e "%s" -l "%s" 2>/dev/null' % (b,e,location['station']), shell=True, stdout=PIPE).stdout

		self.ioloop = tornado.ioloop.IOLoop.instance()
		self.ioloop.add_handler( ph.fileno(), self.async_callback(self.heights), self.ioloop.READ )
		self.ioloop.add_handler( pe.fileno(), self.async_callback(self.events), self.ioloop.READ )

	def heights(self,fd,events):
		self.ioloop.remove_handler(fd)
		self.tides['heights'] = []
		for line in csv.DictReader(self.ph, self.heightfields):
			del line['location'] # reduce the size of the response
			self.tides['heights'].append( line )

		if 'events' in self.tides:
			self.finish(self.tides)

	def events(self,fd,e):
		self.ioloop.remove_handler(fd)
		self.tides['events'] = []
		for line in csv.DictReader(self.pe, self.eventfields):
			del line['location'] # reduce the size of the response
			line['time'],line['datetime'],utcoffset = line['time'].split('@')
			line['utcoffset'] = int( utcoffset[:3] )
			self.tides['events'].append( line )

		if 'heights' in self.tides:
			self.finish(self.tides)
		
class Sitemap(tornado.web.RequestHandler):
	def get(self):
		xml = self.render_string('sitemap.xml',stations=stations)
		self.set_header('Content-Type','text/xml')
		self.finish(xml)

class Mapplet(tornado.web.RequestHandler):
	def get(self):
		xml = self.render_string('mapplet.xml')
		self.set_header('Content-Type','text/xml')
		self.finish(xml)

class Robots(tornado.web.RequestHandler):
	def get(self):
		xml = self.render_string('robots.txt')
		self.set_header('Content-Type','text/plain')
		self.finish(xml)

application = tornado.web.Application([
	(r'/$', MainHandler),
	(r'/mapplet.xml', Mapplet),
	(r'/sitemap.xml', Sitemap),
	(r'/stations.(?P<type>kml|js)', StationList),
	(r'/station/(?P<slug>.*?)/?', Station),
	(r"/(?P<slug>.*?)/(?P<year>\d+)/(?P<month>\d+)/(?P<day>\d+)/json/", TideHandler),
	(r'/robots.txt$', Robots),
	(r'/(?P<slug>[^/]+)/?$', Station),
], static_path=os.path.join(os.path.dirname(__file__),'static') )

if __name__ == "__main__":
	http_server = tornado.httpserver.HTTPServer(application)
	http_server.listen(57469)
	tornado.ioloop.IOLoop.instance().start()
