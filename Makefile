all: frotz node_modules

node_modules:
	@ npm install

frotz:
	@ mkdir frotz
	@ wget -q https://gitlab.com/DavidGriffith/frotz/-/archive/2.52/frotz-2.52.tar.gz -O frotz/frotz-2.52.tar.gz
	@ cd frotz && tar zxvf frotz-2.52.tar.gz
	@ cd frotz/frotz-2.52 && make dumb
	@ ln -s frotz-2.52/dfrotz frotz/dfrotz

clean:
	@ rm -rf frotz node_modules
