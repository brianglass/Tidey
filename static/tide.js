// photos from http://lunar.arc.nasa.gov/science/phases.htm
var i, phases = ['newmoon.png','waxingcres.png','firstquar.png','waxinggib.png','fullmoon.png','waninggib.png','lastquar.png','waningcres.png'];
// preload moon phases
for( i in phases )
	$('<img>').attr('src','{{ static_url('moon') }}/'+phases[i]);

// calculate and choose moon phase photo url
// Check http://inamidst.com/code/moonphase.py for calculaions
function moonphase(now){
	var seconds = (now - new Date(2001,0,1)) / 1000;
	var days = seconds / 86400;
	var lunations = 0.20439731 + days * 0.03386319269;
	var position = lunations % 1;
	var choice = Math.floor( position * 8 + 0.5 ) & 7;
	return phases[choice];
}

// load the moon phase photo
function loadmoon(now){
	var newPhase = moonphase(now);
	var path = '/static/moon/'+newPhase;
	if( $('img#moon').attr('src') != path ){
		$('img#moon').fadeOut(500, function(){
			var img = $(this);
			img.attr( 'src', path );
			setTimeout( function(){ img.fadeIn(500) }, 100 );
		});
	}
}

$(document).ready( function(){
	var today = new Date();
	var utcoffset = -today.getTimezoneOffset() / 60;

	$('#date')
		.change( function(){
			var nd = this.value.match(/(\d+)\/(\d+)\/(\d+)/);
			today.setFullYear( nd[3], nd[1]-1, nd[2] );
			updateChart(today);
		})
		.datepicker();

	var r = Raphael('tides');

	var width = 700;
	var height = 400;
	var lmargin = 30;
	var bmargin = 30;
	var vwidth = width-lmargin;
	var vheight = height-bmargin;

	var miny = {{ station['min'] }};
	var maxy = {{ station['max'] }};
	var minx = 0;
	var maxx = 24;

	var sLatLng = new GLatLng( {{ '-' if station['ns']=='S' else '' }}{{ station['latitude'] }}, {{ '-' if station['ew']=='W' else '' }}{{ station['longitude'] }} );
	var geocoder = new GClientGeocoder();
	geocoder.getLocations( sLatLng, function(response){
		var zipcode = response.Placemark[0].AddressDetails.Country.AdministrativeArea.SubAdministrativeArea.Locality.PostalCode.PostalCodeNumber;
	});

	function mapx(x){
		return Math.round( vwidth*(x-minx)/(maxx-minx) + lmargin);
	}
	function mapy(y){
		return Math.round( vheight - vheight*(y-miny)/(maxy-miny) );
	}

	var path,sunrise,sunset;
	var annotations = [];
	var toffset=null;
	function updateChart(d){
		var year = d.getFullYear();
		var month = d.getMonth()+1;
		var day = d.getDate();
		$.getJSON('/{{ station['slug'] }}/'+year+'/'+month+'/'+day+'/json/', function(data){
			if( toffset == null )
				toffset = data.events[0].utcoffset - utcoffset;

			// create path for the data
			var i;
			var pl = [[mapx(minx),mapy(0)]];
			for( i in data.heights ){
				var d = new Date( parseInt(data.heights[i].date + '000') );
				var hours = d.getHours() + (d.getDate()-day)*24 + d.getMinutes()/60 + toffset;
				if( 0 <= hours && hours <= maxx ){
					var x = mapx( hours );
					var y = mapy( data.heights[i].height );
					pl.push(x+','+y);
				}
			}
			pl.push( [mapx(maxx), mapy(0)] );
			pl = 'M' + pl.join(' L') + 'z';
			if( path )
				path.animate({ path:pl }, 1000,'<>');
			else
				path = r.path( pl ).attr({ stroke:'#637EC7', 'stroke-width':'4px', gradient:'90-#67c-#67c', opacity:0 }).animate({opacity:0.4},1000);

			// remove old annotations
			for( i in annotations ){
				annotations[i].animate({ opacity: 0 }, 1000, function(){
					this.remove();
				});
			}

			// annotate graph
			for( i in data.events ){
				var e = data.events[i];
				var d = new Date( e.datetime * 1000 );
				var hours = d.getHours() + (d.getDate() > day ? 24 : 0) + d.getMinutes()/60 + toffset;
				var x = mapx( hours );

				if( e.height.length > 0 ){
					var m = e.height.match(/([\d-\.]+)/);
					var y = parseFloat(m[1]);
					var ty = mapy( y>0?y:0 );
					y = mapy(y);
					var anno = e.event + '\n' + e.time + '\n' + e.height;

					var circle = r.circle( x, y, 6 ).attr({ opacity: 0, 'stroke-width':'2px', stroke:'#000000', 'fill':'#fff' }).animate({opacity:1}, 1000);
					var text = r.text( x, ty-28, anno ).attr({ opacity: 0, fill:'#fff', 'font-size':'12px' }).animate({opacity:1},1000);
					annotations.push( circle );
					annotations.push( text );
				}else if( e.event == 'Sunrise' ){
					if( sunrise )
						sunrise.animate({ width: x-lmargin },1000);
					else
						sunrise = r.rect( lmargin, 0, x-lmargin, vheight, 0 ).attr({ fill:'#000', stroke:'none', opacity:0.1 }).animate({ opacity:0.2 }, 1000);
				}else if( e.event == 'Sunset' ){
					if( sunset )
						sunset.animate({ x: x, width:width-x },1000);
					else
						sunset = r.rect( x, 0, width-x, vheight, 0 ).attr({ fill:'#000', stroke:'none', opacity:0 }).animate({ opacity:0.2 }, 1000);
				}else if( e.event.match(/^Moon/) ){
				}
			}

			$('#date').val( (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear() );
			loadmoon( d );
		});
	}

	var axis;
	function drawAxis(){
		//r.rect( lmargin, 0, vwidth, vheight, 0 ).attr({ gradient:'90-#a44-#d88', stroke:'none' });
		axis = r.path( 'M'+lmargin+',0 L'+lmargin+','+vheight+' L'+width+','+vheight ).attr({ stroke:'#f0f0f0', 'stroke-width':'3px' });
		var i,m=Math.floor(maxy);
		// y axis
		for( i=Math.ceil(miny); i <= m; i++ ){
			var x = mapx(-0.5);
			var y = mapy(i);
			r.text( x, y, i+'ft' ).attr({ fill:'#ddd', 'font-size':'12px' });
			r.path( 'M'+lmargin+','+y+' L'+width+','+y ).attr({ stroke:'#aaa', 'stroke-width':'1px' });
		}
		// x axis
		for( i=2; i < 24; i+=2 ){
			var x = mapx(i);
			r.path( 'M'+x+','+vheight+' L'+x+','+0 ).attr({ stroke:'#aaa', 'stroke-width':'1px' });
			r.text( x, vheight+10, i+':00' ).attr({ fill:'#ddd', 'font-size':'12px' });
		}
	}

	drawAxis();
	updateChart(today);

	$('#next').click( function(){ 
		today = new Date( today.getTime() + 86400000 )
		updateChart(today);
		return false; 
	});
	$('#previous').click( function(){ 
		today = new Date( today.getTime() - 86400000 )
		updateChart(today);
		return false; 
	});
});
