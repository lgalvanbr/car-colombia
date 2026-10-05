# Corporaciones Ambientales de Colombia

Investigación independiente del Laboratorio SinergIA (Ingeniería Civil y Ambiental,
Universidad de los Andes). Extiende el análisis hecho para [Corpocesar](https://github.com/lgalvanbr/corpocesar)
a las 19 Corporaciones Autónomas Regionales de Colombia identificadas en SECOP II,
con el mismo método: contratación, pérdida de bosque (Hansen) y minería a cielo
abierto (Sentinel-2). Análisis exploratorio con datos abiertos, no una auditoría.

## Estado
- Contratos SECOP II: completo, 19 CAR, 25.486 contratos en ejecución.
- Pérdida de bosque y minería: completo, nacional (32 departamentos).
- Modelo de zonas inundables (HAND): en proceso para los 1.108 municipios del país
  (corriendo en 8 procesos paralelos en el servidor del laboratorio).

## Estructura
- `index.html` — landing con el resumen nacional.
- `datos/cars.json` — las 19 CAR con NIT y departamento.
- `datos/contratos_nacional.json` — contratos en ejecución de las 19 CAR.
- `datos/ranking_cars.json` — ranking por valor contratado.
- `estilo.css` — mismo sistema de diseño de corpocesar.

## Local
```
python3 -m http.server 4310
```
