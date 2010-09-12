function populateMap(manager){
	var ref = [{% for s in stations %}{% if s['type'] == 'Ref' %}
		{ lt:{{ '-' if s['ns']=='S' else '' }}{{ s['latitude'] }}, lg:{{ '-' if s['ew']=='W' else '' }}{{ s['longitude'] }}, nm: "{{ s['station'] }}", sg:"{{ s['slug'] }}" },
	{% end %}{% end %}];

	var sub = [{% for s in stations %}{% if s['type'] == 'Sub' %}
		{ lt:{{ '-' if s['ns']=='S' else '' }}{{ s['latitude'] }}, lg:{{ '-' if s['ew']=='W' else '' }}{{ s['longitude'] }}, nm: "{{ s['station'] }}", sg:"{{ s['slug'] }}" },
	{% end %}{% end %}];

	var i;
	var refMarkers = [];
	var subMarkers = [];
	for( i in ref ){
		var ll = new GLatLng( ref[i].lt, ref[i].lg );
		var marker = new GMarker( ll );
		marker.bindInfoWindowHtml('<h3>View tides for...</h3><a href="/station/'+ref[i].sg+'/">'+ref[i].nm+'</a>');
		refMarkers.push( marker );
	}
	for( i in sub ){
		var ll = new GLatLng( sub[i].lt, sub[i].lg );
		var marker = new GMarker( ll );
		marker.bindInfoWindowHtml('<h3>View tides for...</h3><a href="/station/'+sub[i].sg+'/">'+sub[i].nm+'</a>');
		subMarkers.push( marker );
	}
	manager.addMarkers( subMarkers, 9, 17 );
	manager.addMarkers( refMarkers, 0, 17 );
	manager.refresh();
	/*
	{ content: '<h1>{{ url_escape(s['station']) }}</h1><p><a href="http://tidey.info/station/{{ url_escape(s['station']) }}/">View Chart</a></p>' },
	*/
}
