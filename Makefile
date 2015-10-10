all: frotz node_modules

node_modules:
	@ npm install

frotz:
	@ mkdir frotz
	@ wget -q https://github.com/DavidGriffith/frotz/archive/2.44.tar.gz -O frotz/frotz-2.44.tar.gz
	@ cd frotz && tar zxvf frotz-2.44.tar.gz
	@ cd frotz/frotz-2.44 && make dumb
	@ ln -s frotz-2.44/dfrotz frotz/dfrotz

clean:
	@ rm -rf frotz node_modules
