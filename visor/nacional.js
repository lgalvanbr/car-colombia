(function(){
"use strict";
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function fmt(v,d){return Number(v).toLocaleString("es-CO",{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}
function J(u){return fetch(u).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); });}

var DTIPOS = {perdida_bosque:["Pérdida de bosque (Hansen)","#c0362c"], suelo_alterado_mineria:["Huella de minería (Sentinel-2)","#8a5a2b"]};
var TL_MIN = 2001, TL_MAX = 2024, TL_YR = TL_MAX;
var deptoBbox = {}, cargados = {}, cargandoAhora = {}, danoFeatsPorDepto = {};
var LAY = [];

var map = new maplibregl.Map({container:"map", style:"https://tiles.openfreemap.org/styles/liberty", center:[-74.1,4.2], zoom:5, pitch:0});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}), "top-left");
map.addControl(new maplibregl.ScaleControl({unit:"metric"}), "bottom-left");

(function(){var hcLat=document.getElementById("hcLat"),hcLon=document.getElementById("hcLon"),hcZoom=document.getElementById("hcZoom");
  map.on("mousemove",function(e){hcLat.textContent=e.lngLat.lat.toFixed(4);hcLon.textContent=e.lngLat.lng.toFixed(4);});
  function zz(){hcZoom.textContent=map.getZoom().toFixed(1);} map.on("zoom",zz); map.on("load",zz); zz();
  var pt=document.getElementById("panelToggle"), pn=document.getElementById("panel");
  pt.addEventListener("click", function(){ var c=pn.classList.toggle("collapsed"); pt.setAttribute("aria-expanded", c?"false":"true"); setTimeout(function(){map.resize();},360); });
})();

function filtroTimeline(yr){
  return ["any",
    ["all", ["!=",["get","tipo"],"suelo_alterado_mineria"], ["<=",["get","anio"],yr]],
    ["all", ["==",["get","tipo"],"suelo_alterado_mineria"], ["==",["get","anio"],yr]]
  ];
}

function bboxIntersecta(a, b){
  return !(a[2]<b[0] || a[0]>b[2] || a[3]<b[1] || a[1]>b[3]);
}

function refrescarDanoSource(){
  var todas = [];
  Object.keys(danoFeatsPorDepto).forEach(function(cod){ todas = todas.concat(danoFeatsPorDepto[cod]); });
  if(map.getSource("dano")) map.getSource("dano").setData({type:"FeatureCollection", features: todas});
  actualizarKpis(todas);
}

function actualizarKpis(todas){
  var bosqueHa=0, bosqueN=0, mineriaHa=0, mineriaN=0;
  todas.forEach(function(f){
    var p = f.properties;
    if(p.tipo==="suelo_alterado_mineria"){ if(p.anio===TL_YR){ mineriaHa+=+p.area_ha; mineriaN++; } }
    else if(p.anio<=TL_YR){ bosqueHa+=+p.area_ha; bosqueN++; }
  });
  var totalDeptos = Object.keys(deptoBbox).length;
  document.getElementById("kpis").innerHTML =
    '<div><b>'+fmt(bosqueN)+'</b><span>polígonos de bosque perdido cargados</span></div>'
    +'<div><b>'+fmt(mineriaN)+'</b><span>polígonos de minería cargados ('+TL_YR+')</span></div>'
    +'<div><b>'+fmt(Object.keys(cargados).length)+' / '+totalDeptos+'</b><span>departamentos cargados en esta sesión</span></div>'
    +(map.getZoom()<6.5 ? '<div class="caveat" style="grid-column:1/-1">Acerque el mapa (zoom ≥ 6,5) para empezar a cargar bosque y minería — a escala de todo el país sería demasiado peso de una vez.</div>' : '');
}

function cargarDepartamentosVisibles(){
  if(map.getZoom() < 6.5) return; // a escala pais entero, cargar todo a la vez no tiene sentido
  var b = map.getBounds();
  var vb = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  var pendientes = Object.keys(deptoBbox).filter(function(cod){
    return !cargados[cod] && !cargandoAhora[cod] && bboxIntersecta(deptoBbox[cod], vb);
  });
  if(!pendientes.length) return;
  var cargando = document.getElementById("cargando"), txt = document.getElementById("cargandoTxt");
  cargando.classList.add("on");
  txt.textContent = "Cargando "+pendientes.length+" departamento"+(pendientes.length>1?"s":"")+"…";
  var restan = pendientes.length;
  pendientes.forEach(function(cod){
    cargandoAhora[cod] = true;
    J("../datos/dano_depto/"+cod+".json").then(function(d){
      danoFeatsPorDepto[cod] = d.features;
      cargados[cod] = true;
    }).catch(function(){ danoFeatsPorDepto[cod] = []; cargados[cod] = true; })
    .finally(function(){
      delete cargandoAhora[cod];
      restan--;
      if(restan===0){ cargando.classList.remove("on"); refrescarDanoSource(); }
    });
  });
}

Promise.all([
  J("../datos/departamentos.json"),
  J("../datos/depto_bbox.json"),
  J("../datos/capas/derrumbes.json").catch(function(){return {type:"FeatureCollection",features:[]};}),
  J("../datos/capas/runap.json").catch(function(){return {type:"FeatureCollection",features:[]};}),
  J("../datos/capas/rellenos.json").catch(function(){return {type:"FeatureCollection",features:[]};})
]).then(function(v){
  var deps = v[0]; deptoBbox = v[1];
  var derrumbes = v[2], runap = v[3], rellenos = v[4];

  (map.isStyleLoaded() ? function(f){ f(); } : function(f){ map.once("load", f); })(function(){
    var lbl = map.getStyle().layers.filter(function(l){return l.type==="symbol";})[0]; lbl = lbl && lbl.id;

    map.addSource("deps", {type:"geojson", data: deps});
    map.addLayer({id:"deps_l", type:"line", source:"deps", paint:{"line-color":"#12141a", "line-width":1, "line-opacity":.4}}, lbl);

    map.addSource("runap", {type:"geojson", data: runap});
    map.addLayer({id:"runap_f", type:"fill", source:"runap", layout:{visibility:"none"}, paint:{"fill-color":"#16a34a", "fill-opacity":.22}}, lbl);
    map.addLayer({id:"runap_l", type:"line", source:"runap", layout:{visibility:"none"}, paint:{"line-color":"#16a34a", "line-width":1}}, lbl);
    LAY.push({id:"runap_g", label:"Áreas protegidas (RUNAP)", sw:"#16a34a", on:false, ids:["runap_f","runap_l"]});

    map.addSource("dano", {type:"geojson", data:{type:"FeatureCollection", features:[]}});
    var col = ["match", ["get","tipo"]]; Object.keys(DTIPOS).forEach(function(t){ col.push(t, DTIPOS[t][1]); }); col.push("#999");
    map.addLayer({id:"dano_f", type:"fill", source:"dano", filter: filtroTimeline(TL_YR), paint:{"fill-color":col, "fill-opacity":.65}}, lbl);
    LAY.push({id:"dano_g", label:"Bosque perdido + minería (satélite)", sw:"#c0362c", on:true, ids:["dano_f"]});

    map.addSource("derrumbes", {type:"geojson", data: derrumbes});
    map.addLayer({id:"derrumbes_p", type:"circle", source:"derrumbes", layout:{visibility:"none"}, paint:{"circle-radius":3.5, "circle-color":"#7c3aed", "circle-stroke-width":1, "circle-stroke-color":"#fff"}}, lbl);
    LAY.push({id:"derrumbes_g", label:"Derrumbes reportados (SGC)", sw:"#7c3aed", on:false, ids:["derrumbes_p"]});

    map.addSource("rellenos", {type:"geojson", data: rellenos});
    map.addLayer({id:"rellenos_p", type:"circle", source:"rellenos", layout:{visibility:"none"}, paint:{"circle-radius":5, "circle-color":"#0891b2", "circle-stroke-width":1.5, "circle-stroke-color":"#fff"}}, lbl);
    LAY.push({id:"rellenos_g", label:"Sitios de disposición final (Superservicios)", sw:"#0891b2", on:false, ids:["rellenos_p"]});

    var box = document.getElementById("layers");
    LAY.forEach(function(l){
      var d = document.createElement("div"); d.className = "lr";
      d.innerHTML = '<label><input type="checkbox" '+(l.on?"checked":"")+'> <i class="sw" style="background:'+l.sw+'"></i>'+esc(l.label)+"</label>";
      box.appendChild(d);
      d.querySelector("input").addEventListener("change", function(e){
        l.ids.forEach(function(id){ map.setLayoutProperty(id, "visibility", e.target.checked?"visible":"none"); });
      });
    });

    map.on("click", "dano_f", function(ev){
      var p = ev.features[0].properties;
      document.getElementById("infoT").textContent = DTIPOS[p.tipo] ? DTIPOS[p.tipo][0] : p.tipo;
      document.getElementById("info").innerHTML = "Año "+p.anio+" · "+fmt(p.area_ha,1)+" ha";
    });
    map.on("click", "runap_f", function(ev){
      var p = ev.features[0].properties;
      document.getElementById("infoT").textContent = "Área protegida";
      document.getElementById("info").innerHTML = "<b>"+esc(p.ap_nombre)+"</b><br>"+esc(p.ap_categoria||"")+(p.area_ha_total_resolucion?" · "+fmt(+p.area_ha_total_resolucion)+" ha":"");
    });
    map.on("click", "derrumbes_p", function(ev){
      var p = ev.features[0].properties;
      document.getElementById("infoT").textContent = "Movimiento en masa";
      document.getElementById("info").innerHTML = esc(p.TIPO||"sin tipo")+(p.SUBTIPO?" · "+esc(p.SUBTIPO):"")+(p.ETIQUETA_M?"<br>"+esc(p.ETIQUETA_M):"");
    });
    map.on("click", "rellenos_p", function(ev){
      var p = ev.features[0].properties;
      document.getElementById("infoT").textContent = "Sitio de disposición final";
      document.getElementById("info").innerHTML = "<b>"+esc(p.nombre)+"</b><br>"+esc(p.municipio)+", "+esc(p.departamento)+(p.capacidad_m3?"<br>Capacidad diseño: "+fmt(+p.capacidad_m3)+" m³":"")+"<br><span class='caveat'>Ubicado en el centroide del municipio, no en la coordenada exacta (el registro oficial no la trae).</span>";
    });
    ["dano_f","runap_f","derrumbes_p","rellenos_p"].forEach(function(id){
      map.on("mouseenter", id, function(){ map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, function(){ map.getCanvas().style.cursor = ""; });
    });

    var ticks = document.getElementById("tlTicks");
    for(var y=TL_MIN; y<=TL_MAX; y+=4){ var s=document.createElement("span"); s.textContent=y; ticks.appendChild(s); }

    cargarDepartamentosVisibles();
    map.on("moveend", cargarDepartamentosVisibles);
    actualizarKpis([]);
  });
}).catch(function(e){ document.getElementById("info").innerHTML = "<p class='caveat'>No se pudieron cargar las capas base ("+e.message+").</p>"; });

document.getElementById("tlRange").addEventListener("input", function(e){
  TL_YR = +e.target.value;
  document.getElementById("tlYear").textContent = TL_YR;
  if(map.getLayer("dano_f")) map.setFilter("dano_f", filtroTimeline(TL_YR));
  var todas = []; Object.keys(danoFeatsPorDepto).forEach(function(cod){ todas = todas.concat(danoFeatsPorDepto[cod]); });
  actualizarKpis(todas);
});

var playing = null;
document.getElementById("tlPlay").addEventListener("click", function(){
  var btn = this;
  if(playing){ clearInterval(playing); playing=null; btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; return; }
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
  if(TL_YR>=TL_MAX) TL_YR = TL_MIN;
  playing = setInterval(function(){
    TL_YR++; if(TL_YR>TL_MAX){ clearInterval(playing); playing=null; btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; return; }
    document.getElementById("tlRange").value = TL_YR; document.getElementById("tlYear").textContent = TL_YR;
    if(map.getLayer("dano_f")) map.setFilter("dano_f", filtroTimeline(TL_YR));
    var todas=[]; Object.keys(danoFeatsPorDepto).forEach(function(cod){ todas=todas.concat(danoFeatsPorDepto[cod]); });
    actualizarKpis(todas);
  }, 900);
});
})();
