.PHONY: all clean install

all: node_modules smf.xml

node_modules: package.json
	npm install

smf.xml: smf-template.xml
	sed 's#__DIRECTORY__#$(PWD)#g' < $< > $@

install: smf.xml config.json
	svccfg import $<

config.json:
	@echo 'You must create config.json yourself. Use config.json.dist as an example.' ; exit 1

clean:
	rm -rf node_modules smf.xml
